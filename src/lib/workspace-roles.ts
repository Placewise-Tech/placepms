import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

export type WorkspaceRole = 'student' | 'admin' | 'teacher' | 'staff';
export const roleLabels: Record<WorkspaceRole, string> = { student: 'Student', admin: 'Administrator', teacher: 'Teacher', staff: 'Staff' };
// This is the installation owner selected for the initial PlacePMS deployment.
// The server still verifies and persists the role; this value is never used as
// a client-side permission check.
export const designatedAdministratorEmail = 'placewiseinfo@gmail.com';
// App metadata is the fast navigation hint. The app also resolves the live
// managed account before choosing a workspace, and database/API permissions
// always read that server-owned account, including after role changes.
export function workspaceRole(user: Pick<User, 'app_metadata'>): WorkspaceRole {
  const role = user.app_metadata.workspace_role;
  return role === 'admin' || role === 'teacher' || role === 'staff' ? role : 'student';
}
export const workspaceRoot = (user: Pick<User, 'app_metadata'>) => workspaceRole(user) === 'student' ? '/dashboard' : `/${workspaceRole(user)}`;
export const workspaceRootForRole = (role: WorkspaceRole) => role === 'student' ? '/dashboard' : `/${role}`;
export const WorkspaceRootContext = createContext('/dashboard');
export const useWorkspaceRoot = () => useContext(WorkspaceRootContext);
export const managedPath = /^\/(dashboard|admin|teacher|staff)(?:\/|$)/;
export const featureLabels = { github: 'GitHub analysis', figma: 'Figma analysis', miro: 'Miro analysis', research: 'Research', resource: 'Academic resources', document: 'Documents', blackbook: 'Blackbook' };
export type FeatureKey = keyof typeof featureLabels;
export interface ManagementSettings { registration_enabled: boolean; features: Record<FeatureKey, boolean> }
export interface ManagedAccount { id: string; email: string; full_name: string; college: string | null; role: WorkspaceRole; enabled: boolean; can_mentor: boolean; department: string }
