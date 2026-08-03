import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model, Types } from 'mongoose';
import { User, UserDocument } from '../auth/user.schema';
import { UserRole, normalizeUserRole } from '../common/enums/role.enum';
import { optionalObjectId, toObjectId } from '../common/mongo-id';
import { Tenant, TenantDocument } from '../tenants/tenant.schema';
import { AssignTicketDto, CreateTicketDto, CreateTicketMessageDto, UpdateTicketDto } from './ticket.dto';
import { TICKET_PRIORITIES, TICKET_STATUSES, Ticket, TicketDocument } from './ticket.schema';
import { TicketMessage, TicketMessageDocument } from './ticket-message.schema';

const CLIENT_ROLES = [UserRole.CLIENT_OWNER, UserRole.CLIENT_USER];
const TERMINAL_STATUSES = ['resolved', 'closed'];
const CLIENT_MUTABLE_STATUSES = ['open', 'closed'];

@Injectable()
export class TicketsService {
  constructor(
    @InjectModel(Ticket.name) private ticketModel: Model<TicketDocument>,
    @InjectModel(TicketMessage.name) private messageModel: Model<TicketMessageDocument>,
    @InjectModel(User.name) private userModel: Model<UserDocument>,
    @InjectModel(Tenant.name) private tenantModel: Model<TenantDocument>,
  ) {}

  async list(user: any, query: Record<string, string>) {
    const role = normalizeUserRole(user.role) as UserRole;
    const filter: any = {};

    if (CLIENT_ROLES.includes(role)) {
      filter.tenantId = toObjectId(user.tenantId, 'tenantId');
    } else if (role === UserRole.MASTER) {
      filter.assignedTo = toObjectId(user._id, 'userId');
    } else if (query.tenantId) {
      filter.tenantId = toObjectId(query.tenantId, 'tenantId');
    }

    if (query.status && query.status !== 'all') filter.status = query.status;
    if (query.priority && query.priority !== 'all') filter.priority = query.priority;
    if (query.assignedTo && query.assignedTo !== 'all') {
      filter.assignedTo = query.assignedTo === 'unassigned' ? null : toObjectId(query.assignedTo, 'assignedTo');
    }

    const search = String(query.search || '').trim();
    if (search) {
      const re = new RegExp(search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
      filter.$or = [{ refNumber: re }, { subject: re }, { category: re }, { lastMessagePreview: re }];
    }

    return this.ticketModel
      .find(filter)
      .sort({ lastMessageAt: -1, updatedAt: -1 })
      .populate('tenantId', 'name contactEmail')
      .populate('createdBy', 'name email role')
      .populate('assignedTo', 'name email role')
      .populate('lastMessageBy', 'name email role');
  }

  async findOne(id: string, user: any) {
    const ticket = await this.ticketModel.findById(id);
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.assertCanView(ticket, user);
    return ticket.populate([
      { path: 'tenantId', select: 'name contactEmail' },
      { path: 'createdBy', select: 'name email role' },
      { path: 'assignedTo', select: 'name email role' },
      { path: 'lastMessageBy', select: 'name email role' },
    ]);
  }

  async messages(id: string, user: any) {
    await this.findOne(id, user);
    return this.messageModel
      .find({ ticketId: toObjectId(id, 'ticketId') })
      .sort({ createdAt: 1 })
      .populate('senderId', 'name email role');
  }

  async create(dto: CreateTicketDto, user: any) {
    const role = normalizeUserRole(user.role) as UserRole;
    if (!CLIENT_ROLES.includes(role) && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only clients and admin can create tickets');
    }

    const tenantId = CLIENT_ROLES.includes(role)
      ? toObjectId(user.tenantId, 'tenantId')
      : toObjectId(dto.tenantId, 'tenantId');
    if (!dto.subject?.trim()) throw new BadRequestException('Ticket subject is required');
    if (!dto.message?.trim()) throw new BadRequestException('Ticket message is required');
    await this.assertTenantExists(tenantId);

    const priority = this.validPriority(dto.priority || 'normal');
    const now = new Date();
    const ticketId = new Types.ObjectId();
    const ticket = await this.ticketModel.create({
      _id: ticketId,
      tenantId,
      createdBy: toObjectId(user._id, 'userId'),
      refNumber: this.createRefNumber(ticketId, now),
      subject: dto.subject.trim(),
      category: dto.category?.trim() || 'general',
      priority,
      status: 'open',
      lastMessagePreview: dto.message.trim().slice(0, 180),
      lastMessageAt: now,
      lastMessageBy: toObjectId(user._id, 'userId'),
    });
    await this.createMessage(ticket, user, dto.message.trim(), 'message');
    return this.findOne(String(ticket._id), user);
  }

  async reply(id: string, dto: CreateTicketMessageDto, user: any) {
    if (!dto.body?.trim()) throw new BadRequestException('Message is required');
    const ticket = await this.ticketModel.findById(id);
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.assertCanView(ticket, user);

    await this.createMessage(ticket, user, dto.body.trim(), 'message');
    ticket.lastMessagePreview = dto.body.trim().slice(0, 180);
    ticket.lastMessageAt = new Date();
    ticket.lastMessageBy = toObjectId(user._id, 'userId');
    if (TERMINAL_STATUSES.includes(ticket.status)) {
      ticket.status = 'open';
      ticket.resolvedAt = undefined;
      ticket.closedAt = undefined;
    }
    await ticket.save();
    return this.messages(id, user);
  }

  async assign(id: string, dto: AssignTicketDto, user: any) {
    this.assertAdmin(user);
    const ticket = await this.ticketModel.findById(id);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const assignee = await this.findMaster(dto.assignedTo);
    const label = assignee ? `Assigned to ${assignee.name || assignee.email}` : 'Assignment cleared';
    ticket.assignedTo = assignee?._id as Types.ObjectId || null;
    if (assignee && !TERMINAL_STATUSES.includes(ticket.status)) ticket.status = 'assigned';
    if (!assignee && ticket.status === 'assigned') ticket.status = 'open';
    ticket.lastMessagePreview = label;
    ticket.lastMessageAt = new Date();
    ticket.lastMessageBy = toObjectId(user._id, 'userId');
    await ticket.save();

    await this.createMessage(ticket, user, label, 'assignment');
    return this.findOne(id, user);
  }

  async update(id: string, dto: UpdateTicketDto, user: any) {
    const ticket = await this.ticketModel.findById(id);
    if (!ticket) throw new NotFoundException('Ticket not found');
    this.assertCanUpdate(ticket, user);
    const role = normalizeUserRole(user.role) as UserRole;

    if (CLIENT_ROLES.includes(role) && (dto.priority !== undefined || dto.category !== undefined)) {
      throw new ForbiddenException('Clients can update ticket status, but priority and category are managed by support staff');
    }

    const systemEvents: Array<{ body: string; kind: string }> = [];
    if (dto.status !== undefined) {
      const nextStatus = this.validStatus(dto.status);
      if (CLIENT_ROLES.includes(role) && !CLIENT_MUTABLE_STATUSES.includes(nextStatus)) {
        throw new ForbiddenException('Clients can only reopen or close their tickets');
      }
      ticket.status = nextStatus;
      if (ticket.status === 'resolved') ticket.resolvedAt = new Date();
      else ticket.resolvedAt = undefined;
      if (ticket.status === 'closed') ticket.closedAt = new Date();
      else ticket.closedAt = undefined;
      systemEvents.push({ body: `Status changed to ${ticket.status}`, kind: 'status' });
    }
    if (dto.priority !== undefined) {
      ticket.priority = this.validPriority(dto.priority);
      systemEvents.push({ body: `Priority changed to ${ticket.priority}`, kind: 'priority' });
    }
    if (dto.category !== undefined) ticket.category = dto.category.trim() || 'general';
    if (systemEvents.length) {
      ticket.lastMessagePreview = systemEvents[systemEvents.length - 1].body;
      ticket.lastMessageAt = new Date();
      ticket.lastMessageBy = toObjectId(user._id, 'userId');
    }
    await ticket.save();

    for (const event of systemEvents) {
      await this.createMessage(ticket, user, event.body, event.kind);
    }
    return this.findOne(id, user);
  }

  masters() {
    return this.userModel
      .find({ role: UserRole.MASTER, isActive: true })
      .select('name email role')
      .sort({ name: 1, email: 1 });
  }

  private async createMessage(ticket: TicketDocument, user: any, body: string, kind: string) {
    const role = normalizeUserRole(user.role) as UserRole;
    await this.messageModel.create({
      ticketId: ticket._id,
      tenantId: ticket.tenantId,
      senderId: toObjectId(user._id, 'userId'),
      senderRole: role === UserRole.ADMIN ? 'admin' : role === UserRole.MASTER ? 'master' : 'client',
      body,
      kind,
    });
  }

  private assertCanView(ticket: TicketDocument, user: any) {
    const role = normalizeUserRole(user.role) as UserRole;
    if (role === UserRole.ADMIN) return;
    if (role === UserRole.MASTER && this.sameId(ticket.assignedTo, user._id)) return;
    if (CLIENT_ROLES.includes(role) && this.sameId(ticket.tenantId, user.tenantId)) return;
    throw new ForbiddenException('You do not have access to this ticket');
  }

  private assertCanUpdate(ticket: TicketDocument, user: any) {
    const role = normalizeUserRole(user.role) as UserRole;
    if (role === UserRole.ADMIN) return;
    if (role === UserRole.MASTER && this.sameId(ticket.assignedTo, user._id)) return;
    if (CLIENT_ROLES.includes(role) && this.sameId(ticket.tenantId, user.tenantId)) return;
    throw new ForbiddenException('You cannot update this ticket');
  }

  private sameId(left: any, right: any) {
    const leftId = this.idString(left);
    const rightId = this.idString(right);
    return Boolean(leftId && rightId && leftId === rightId);
  }

  private idString(value: any) {
    if (!value) return '';
    if (value instanceof Types.ObjectId) return value.toHexString();
    if (typeof value === 'string') return value;
    if (typeof value.toHexString === 'function') return value.toHexString();
    if (value._id) return this.idString(value._id);
    if (value.id) return this.idString(value.id);
    return String(value);
  }

  private createRefNumber(ticketId: Types.ObjectId, date: Date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    const suffix = ticketId.toHexString().slice(-6).toUpperCase();
    return `TCK-${year}${month}${day}-${suffix}`;
  }

  private assertAdmin(user: any) {
    if (normalizeUserRole(user.role) !== UserRole.ADMIN) {
      throw new ForbiddenException('Only admin can assign tickets');
    }
  }

  private validStatus(status: string) {
    if (!(TICKET_STATUSES as readonly string[]).includes(status)) throw new BadRequestException('Invalid ticket status');
    return status;
  }

  private validPriority(priority: string) {
    if (!(TICKET_PRIORITIES as readonly string[]).includes(priority)) throw new BadRequestException('Invalid ticket priority');
    return priority;
  }

  private async findMaster(userId?: string | null) {
    const id = optionalObjectId(userId, 'assignedTo');
    if (!id) return null;
    const user = await this.userModel.findOne({ _id: id, role: UserRole.MASTER, isActive: true }).select('name email role');
    if (!user) throw new BadRequestException('Select an active master user');
    return user;
  }

  private async assertTenantExists(tenantId: Types.ObjectId) {
    const tenant = await this.tenantModel.exists({ _id: tenantId });
    if (!tenant) throw new BadRequestException('Client tenant not found');
  }
}