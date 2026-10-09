export type AuthUser = {
  id: string;
  fullName: string;
  email: string;
  notivaId?: string;
  recoveryEmail?: string;
  recoveryEmailVerified?: boolean;
  mobileNumber: string;
  organizationCode: string;
  department: string;
  role: string;
};

export type AuthSession = {
  token: string;
  user: AuthUser;
};
