export interface User {
  id: number;
  name: string;
  email: string;
  role: string;
  status: string;
  department: string;
  phone: string;
  remark: string;
  createdAt: number;
}

export interface UserFormData {
  name: string;
  email: string;
  role: string;
  status: string;
  department: string;
  phone: string;
  remark: string;
}

export interface ConfirmState {
  type: string;
  user?: User;
  message: string;
}
