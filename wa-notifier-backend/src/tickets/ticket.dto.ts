export class CreateTicketDto {
  tenantId?: string;
  subject: string;
  category?: string;
  priority?: string;
  message: string;
}

export class UpdateTicketDto {
  status?: string;
  priority?: string;
  category?: string;
}

export class AssignTicketDto {
  assignedTo?: string | null;
}

export class CreateTicketMessageDto {
  body: string;
}
