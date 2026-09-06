export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  mobileNumber: string;
  organizationCode: string;
  department: string;
  role: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};
