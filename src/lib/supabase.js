/**
 * LAUNCHFLOW — SUPABASE CLIENT & DATA LAYER
 * Production client initialization, authentication handlers,
 * real-time state synchronization, and database operations.
 */

import { createClient } from '@supabase/supabase-js';

// Retrieve environment variables from Vite
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

// Check if credentials are valid and configured
export const isSupabaseConfigured = Boolean(
  supabaseUrl && 
  supabaseKey && 
  !supabaseUrl.includes('your-project-ref') && 
  !supabaseKey.includes('your_key_here')
);

if (!isSupabaseConfigured) {
  console.warn(
    '[LaunchFlow] Supabase environment variables are missing or using placeholder values. ' +
    'Please verify VITE_SUPABASE_URL and VITE_SUPABASE_PUBLISHABLE_KEY in your .env configuration.'
  );
}

// Single initialized Supabase client instance
export const supabase = isSupabaseConfigured
  ? createClient(supabaseUrl, supabaseKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
        storageKey: 'launchflow_auth_session',
      },
    })
  : null;

// ============================================================================
// AUTHENTICATION HELPERS
// ============================================================================

/**
 * Register a new user with email, password, full name and initial workspace
 */
export async function signUpUser({ email, password, fullName, workspaceName }) {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Check your environment variables.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const cleanName = fullName ? fullName.trim() : cleanEmail.split('@')[0];
  const cleanWorkspace = workspaceName ? workspaceName.trim() : `${cleanName}'s Workspace`;

  // 1. Sign up user via Supabase Auth
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: cleanEmail,
    password: password,
    options: {
      data: {
        full_name: cleanName,
        initial_workspace: cleanWorkspace,
      },
    },
  });

  if (authError) {
    throw authError;
  }

  const user = authData?.user;
  const session = authData?.session;

  // 2. If user is immediately confirmed/logged in, ensure workspace and profile exist
  if (user && session) {
    try {
      await setupInitialUserWorkspace(user, cleanWorkspace, cleanName);
    } catch (wsErr) {
      console.error('[LaunchFlow] Initial workspace setup deferred:', wsErr);
    }
  }

  return { user, session };
}

/**
 * Sign in an existing user with email and password
 */
export async function signInUser({ email, password }) {
  if (!supabase) {
    throw new Error('Supabase client is not configured. Check your environment variables.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: cleanEmail,
    password: password,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Sign out current authenticated session
 */
export async function signOutUser() {
  if (!supabase) return;
  const { error } = await supabase.auth.signOut();
  if (error) {
    console.error('[LaunchFlow] Error during sign out:', error);
    throw error;
  }
}

/**
 * Send password reset email
 */
export async function resetPassword(email) {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const cleanEmail = email.trim().toLowerCase();
  const { data, error } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
    redirectTo: `${window.location.origin}/#reset-password`,
  });

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Get current active session
 */
export async function getCurrentSession() {
  if (!supabase) return null;
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error) {
    console.error('[LaunchFlow] Failed to fetch session:', error);
    return null;
  }
  return session;
}

/**
 * Get current user
 */
export async function getCurrentUser() {
  if (!supabase) return null;
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    return null;
  }
  return user;
}

/**
 * Subscribe to auth state transitions
 */
export function onAuthStateChange(callback) {
  if (!supabase) {
    return { data: { subscription: { unsubscribe: () => {} } } };
  }
  return supabase.auth.onAuthStateChange((event, session) => {
    callback(event, session);
  });
}

// ============================================================================
// WORKSPACE & DATA LAYER
// ============================================================================

/**
 * Sets up a user's initial workspace and seeds starter sprint items
 */
export async function setupInitialUserWorkspace(user, workspaceName, fullName) {
  if (!supabase || !user) return null;

  const slug = workspaceName.toLowerCase().replace(/[^a-z0-9]/g, '-').replace(/-+/g, '-');

  // Check if workspace already exists for this owner
  const { data: existingWs } = await supabase
    .from('workspaces')
    .select('*')
    .eq('owner_id', user.id)
    .limit(1);

  let workspace = existingWs?.[0];

  if (!workspace) {
    // Insert new workspace
    const { data: newWs, error: wsError } = await supabase
      .from('workspaces')
      .insert({
        name: workspaceName,
        slug: slug || 'workspace',
        owner_id: user.id,
      })
      .select()
      .single();

    if (wsError) {
      console.warn('[LaunchFlow] Workspaces table not ready or error:', wsError.message);
      return null;
    }
    workspace = newWs;

    // Add owner to workspace_members
    await supabase.from('workspace_members').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      role: 'owner',
    });

    // Create an initial sample sprint project
    const { data: project } = await supabase
      .from('projects')
      .insert({
        workspace_id: workspace.id,
        name: 'Sprint 34 • Core Architecture v2',
        description: 'Primary engineering deliverables and performance milestones',
        status: 'active',
        created_by: user.id,
      })
      .select()
      .single();

    // Seed realistic starter tasks into the user's real Supabase database
    const projectId = project?.id || null;
    const starterTasks = [
      {
        workspace_id: workspace.id,
        project_id: projectId,
        title: 'Design system token hierarchy & contrast calibration',
        description: 'Harmonize midnight violet surface tokens across all modal overlays and cards',
        status: 'completed',
        priority: 'high',
        category: 'Design System',
        assignee_name: fullName || 'Elena R.',
        created_by: user.id,
      },
      {
        workspace_id: workspace.id,
        project_id: projectId,
        title: 'Optimize GraphQL & API gateway latency < 40ms',
        description: 'Implement distributed response caching and payload decompression',
        status: 'in-progress',
        priority: 'urgent',
        category: 'Backend',
        assignee_name: 'Marcus V.',
        created_by: user.id,
      },
      {
        workspace_id: workspace.id,
        project_id: projectId,
        title: 'Implement real-time collaboration canvas with CRDTs',
        description: 'Zero-conflict multiplayer presence synchronization for team specs',
        status: 'in-progress',
        priority: 'high',
        category: 'Frontend',
        assignee_name: 'Sarah C.',
        created_by: user.id,
      },
      {
        workspace_id: workspace.id,
        project_id: projectId,
        title: 'Audit SOC-2 Type II access controls and encryption tokens',
        description: 'Verify automated rotation policies and IAM boundary isolation',
        status: 'todo',
        priority: 'medium',
        category: 'Security',
        assignee_name: 'David T.',
        created_by: user.id,
      },
    ];

    await supabase.from('tasks').insert(starterTasks);

    // Initial activity log
    await supabase.from('activity_logs').insert({
      workspace_id: workspace.id,
      user_id: user.id,
      user_name: fullName || 'Admin',
      action: 'created',
      entity_type: 'workspace',
      entity_id: workspace.id,
      details: `Initialized workspace "${workspace.name}" with default sprint deliverables.`,
    });
  }

  return workspace;
}

/**
 * Fetch workspaces accessible by current user
 */
export async function getUserWorkspaces(userId) {
  if (!supabase || !userId) return [];

  const { data, error } = await supabase
    .from('workspaces')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[LaunchFlow] Could not fetch workspaces:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Fetch tasks for a workspace with optional status filter
 */
export async function getWorkspaceTasks(workspaceId, statusFilter = 'all') {
  if (!supabase || !workspaceId) return [];

  let query = supabase
    .from('tasks')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (statusFilter && statusFilter !== 'all') {
    query = query.eq('status', statusFilter);
  }

  const { data, error } = await query;
  if (error) {
    console.warn('[LaunchFlow] Error loading workspace tasks:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Create a new task in Supabase
 */
export async function createTask(taskPayload) {
  if (!supabase) {
    throw new Error('Supabase client is not configured.');
  }

  const { data, error } = await supabase
    .from('tasks')
    .insert([taskPayload])
    .select()
    .single();

  if (error) {
    throw error;
  }

  // Record activity log
  if (taskPayload.workspace_id) {
    try {
      await supabase.from('activity_logs').insert({
        workspace_id: taskPayload.workspace_id,
        user_id: taskPayload.created_by,
        user_name: taskPayload.assignee_name || 'Team Member',
        action: 'created',
        entity_type: 'task',
        entity_id: data.id,
        details: `Created task "${data.title}"`,
      });
    } catch (e) {
      // non-critical
    }
  }

  return data;
}

/**
 * Update task status (e.g. 'completed' vs 'in-progress' vs 'todo')
 */
export async function updateTaskStatus(taskId, newStatus) {
  if (!supabase || !taskId) return null;

  const { data, error } = await supabase
    .from('tasks')
    .update({
      status: newStatus,
      updated_at: new Date().toISOString(),
    })
    .eq('id', taskId)
    .select()
    .single();

  if (error) {
    throw error;
  }

  return data;
}

/**
 * Delete a task
 */
export async function deleteTask(taskId) {
  if (!supabase || !taskId) return false;

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('id', taskId);

  if (error) {
    throw error;
  }

  return true;
}

/**
 * Fetch projects for a workspace
 */
export async function getWorkspaceProjects(workspaceId) {
  if (!supabase || !workspaceId) return [];

  const { data, error } = await supabase
    .from('projects')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false });

  if (error) {
    console.warn('[LaunchFlow] Error loading projects:', error.message);
    return [];
  }

  return data || [];
}

/**
 * Fetch real activity logs for a workspace
 */
export async function getWorkspaceActivity(workspaceId, limit = 8) {
  if (!supabase || !workspaceId) return [];

  const { data, error } = await supabase
    .from('activity_logs')
    .select('*')
    .eq('workspace_id', workspaceId)
    .order('created_at', { ascending: false })
    .limit(limit);

  if (error) {
    console.warn('[LaunchFlow] Error loading activity logs:', error.message);
    return [];
  }

  return data || [];
}
