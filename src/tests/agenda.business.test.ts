import { expect, test, describe } from 'vitest';

// Simulating the business logic for appointment duration found in server.ts
function validateAppointmentDuration(data_inicio: string, data_fim: string, items: any[]) {
    let totalServicoMinutos = 0;
    for (const item of items) {
        if (item.tipo === 'servico') {
            totalServicoMinutos += (item.tempo_execucao || 0);
        }
    }

    if (totalServicoMinutos > 0) {
        const diffMs = new Date(data_fim).getTime() - new Date(data_inicio).getTime();
        const diffMinutos = diffMs / 60000;
        if (diffMinutos < totalServicoMinutos) {
            return {
                valid: false,
                error: `O tempo selecionado (${Math.round(diffMinutos)}min) é inferior ao tempo mínimo dos serviços (${totalServicoMinutos}min).`
            };
        }
    }
    return { valid: true };
}

describe('Agenda Routine Logic Tests', () => {
    test('Should pass when duration is sufficient for services', () => {
        const data_inicio = '2023-10-10T10:00:00';
        const data_fim = '2023-10-10T11:00:00'; // 60 min
        const items = [
            { tipo: 'servico', tempo_execucao: 30 },
            { tipo: 'servico', tempo_execucao: 20 }
        ];
        
        const result = validateAppointmentDuration(data_inicio, data_fim, items);
        expect(result.valid).toBe(true);
    });

    test('Should fail when duration is shorter than service time', () => {
        const data_inicio = '2023-10-10T10:00:00';
        const data_fim = '2023-10-10T10:30:00'; // 30 min
        const items = [
            { tipo: 'servico', tempo_execucao: 45 }
        ];
        
        const result = validateAppointmentDuration(data_inicio, data_fim, items);
        expect(result.valid).toBe(false);
        expect(result.error).toContain('inferior ao tempo mínimo');
    });

    test('Should handle mixed items (products + services)', () => {
        const data_inicio = '2023-10-10T10:00:00';
        const data_fim = '2023-10-10T10:45:00'; // 45 min
        const items = [
            { tipo: 'servico', tempo_execucao: 30 },
            { tipo: 'produto', tempo_execucao: 0 }
        ];
        
        const result = validateAppointmentDuration(data_inicio, data_fim, items);
        expect(result.valid).toBe(true);
    });

    test('Should calculate total value correctly', () => {
      const items = [
        { preco_unitario: 50, quantidade: 2 },
        { preco_unitario: 30, quantidade: 1 }
      ];
      const total = items.reduce((acc, item) => acc + (item.preco_unitario * item.quantidade), 0);
      expect(total).toBe(130);
    });

    test('Security: Should only return data for the correctly specified tenant_id', () => {
        // Mocking the database filtering logic
        const appointments = [
            { id: 1, tenant_id: 'tenant-A', description: 'Agenda A' },
            { id: 2, tenant_id: 'tenant-B', description: 'Agenda B' }
        ];

        const getAppointmentsForTenant = (requestTenantId: string) => {
            return appointments.filter(a => a.tenant_id === requestTenantId);
        };

        const resultA = getAppointmentsForTenant('tenant-A');
        const resultB = getAppointmentsForTenant('tenant-B');

        expect(resultA).toHaveLength(1);
        expect(resultA[0].tenant_id).toBe('tenant-A');
        expect(resultB).toHaveLength(1);
        expect(resultB[0].tenant_id).toBe('tenant-B');
        
        // Ensure unknown tenant returns empty
        expect(getAppointmentsForTenant('tenant-C')).toHaveLength(0);
    });
});
