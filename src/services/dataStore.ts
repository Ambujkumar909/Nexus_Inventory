
import { Laptop, LaptopRequest, User, UserRole, LaptopStatus, RequestStatus, RequestType } from '../types';

export const INITIAL_LAPTOPS: Laptop[] = [
  // Corrected property names to match snake_case interface
  { id: '1', serial_number: 'SN-X1-9921', service_id: 'TAG-LN-001', brand: 'Lenovo', model: 'ThinkPad X1 Carbon', specs: '32GB RAM, 1TB SSD, i7 Gen 12', status: LaptopStatus.AVAILABLE, purchase_date: '2023-01-15' },
  { id: '2', serial_number: 'SN-MB-4412', service_id: 'TAG-AP-042', brand: 'Apple', model: 'MacBook Pro 14"', specs: 'M2 Pro, 16GB RAM, 512GB SSD', status: LaptopStatus.ASSIGNED, last_assigned_to: 'EMP001', purchase_date: '2023-03-10' },
  { id: '3', serial_number: 'SN-DE-1102', service_id: 'TAG-DL-993', brand: 'Dell', model: 'XPS 15', specs: '32GB RAM, 1TB SSD, RTX 3050 Ti', status: LaptopStatus.AVAILABLE, purchase_date: '2022-11-20' },
  { id: '4', serial_number: 'SN-HP-8839', service_id: 'TAG-HP-112', brand: 'HP', model: 'EliteBook 840', specs: '16GB RAM, 256GB SSD, i5', status: LaptopStatus.SCRAP, purchase_date: '2020-05-12' },
];

export const INITIAL_REQUESTS: LaptopRequest[] = [
  // Corrected property names to match snake_case interface
  { id: 'REQ-101', employee_id: 'EMP002', employee_name: 'Jane Smith', type: RequestType.PERMANENT, reason: 'Current device hardware failure', status: RequestStatus.PENDING, requested_at: new Date().toISOString() },
  { id: 'REQ-100', employee_id: 'EMP001', employee_name: 'John Doe', type: RequestType.TEMPORARY, reason: 'Conference trip', status: RequestStatus.ASSIGNED, requested_at: '2024-05-01T10:00:00Z', assigned_laptop_id: '2', return_date: '2024-05-20' },
];

export const INITIAL_ADMINS: User[] = [
  { id: 'root-001', employeeId: 'ROOT001', name: 'System Root', role: UserRole.ROOT, isApproved: true },
  { id: 'admin-001', employeeId: 'ADM001', name: 'Regular Admin', role: UserRole.ADMIN, isApproved: true },
  { id: 'admin-pending-01', employeeId: 'ADM002', name: 'Pending Admin', role: UserRole.ADMIN, isApproved: false },
];