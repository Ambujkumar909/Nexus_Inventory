
export enum UserRole {
  USER = 'USER',
  ADMIN = 'ADMIN',
  ROOT = 'ROOT',
}

export enum RequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ASSIGNED = 'ASSIGNED',
  RETURNED = 'RETURNED',
}

export enum RequestType {
  PERMANENT = 'PERMANENT',
  TEMPORARY = 'TEMPORARY',
  REPLACEMENT = 'REPLACEMENT',
}

export enum LaptopStatus {
  AVAILABLE = 'AVAILABLE',
  ASSIGNED = 'ASSIGNED',
  SCRAP = 'SCRAP',
  MAINTENANCE = 'MAINTENANCE',
}
export enum AssetCategory {
  LAPTOP = 'Laptop',
  MOUSE = 'Mouse',
  KEYBOARD = 'Keyboard',
  MONITOR = 'Monitor',
  IMAC = 'iMac',
  PC = 'PC',
  MOBILE_PHONE = 'Mobiles'
}
export interface User {
  id: string;
  employeeId: string;
  name: string;
  mobileNumber?: string;
  email?: string;
  role: UserRole;
  isApproved: boolean;
}

export interface Laptop {
  id: string;
  serial_number: string;
  service_id: string;
  model: string;
  brand: string;
  specs: string;
  category: AssetCategory;
  status: LaptopStatus;
  last_assigned_to?: string;
  purchase_date: string;
  scrapped_by?: string;
  scrapped_at?: string;
}
export enum EditRequestStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
}
export interface LaptopEditRequest {
  id: string;
  laptop_id: string;
  proposed_by: string;
  requested_at: string;
  old_values: Partial<Laptop>;
  new_values: Partial<Laptop>;
  status: EditRequestStatus;
}

export interface LaptopRequest {
  id: string;
  employee_id: string;
  employee_name: string;
  type: RequestType;
  reason: string;
  status: RequestStatus;
  requested_at: string;
  approved_by?: string;
  assigned_laptop_id?: string;
  return_date?: string;
}
