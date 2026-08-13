import { AuditService } from '@services/AuditService'

export class AduitNoteJob {
    public async run(): Promise<void> {
        const auditService = new AuditService()
        await auditService.removeNotesFromInactiveCompanies()
    }
}
