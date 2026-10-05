import { createContext, useContext } from 'react';
import type { User } from '@supabase/supabase-js';

export type WorkspaceRole = 'student' | 'admin' | 'teacher' | 'staff';
export const roleLabels: Record<WorkspaceRole, string> = { student: 'Student', admin: 'Administrator', teacher: 'Teacher', staff: 'Staff' };
// Only server-owned app metadata is used for navigation. Database/API permissions
// always read the live managed account, including after a role change or suspension.
export function workspaceRole(user: Pick<User, 'app_metadata'>): WorkspaceRole {
  const role = user.app_metadata.workspace_role;
  return role === 'admin' || role === 'teacher' || role === 'staff' ? role : 'student';
}
export const workspaceRoot = (user: Pick<User, 'app_metadata'>) => workspaceRole(user) === 'student' ? '/dashboard' : `/${workspaceRole(user)}`;
export const WorkspaceRootContext = createContext('/dashboard');
export const useWorkspaceRoot = () => useContext(WorkspaceRootContext);
export const managedPath = /^\/(dashboard|admin|teacher|staff)(?:\/|$)/;
export const featureLabels = { github: 'GitHub analysis', figma: 'Figma analysis', miro: 'Miro analysis', research: 'Research', resource: 'Academic resources', document: 'Documents', blackbook: 'Blackbook' };
export type FeatureKey = keyof typeof featureLabels;
export interface ManagementSettings { registration_enabled: boolean; features: Record<FeatureKey, boolean> }
export interface ManagedAccount { id: string; email: string; full_name: string; college: string | null; role: WorkspaceRole; enabled: boolean; can_mentor: boolean; department: string }
