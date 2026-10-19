/**
 * LAUNCHFLOW — FULL CLIENT-SIDE APPLICATION SCRIPT
 * Complete Supabase Authentication, Real-Time State Management,
 * Interactive Modals, and Dashboard Telemetry.
 */

import { createIcons, icons } from 'lucide';
import {
  isSupabaseConfigured,
  supabase,
  signUpUser,
  signInUser,
  signOutUser,
  resetPassword,
  getCurrentSession,
  getCurrentUser,
  onAuthStateChange,
  getUserWorkspaces,
  getWorkspaceTasks,
  createTask,
  updateTaskStatus,
  deleteTask,
  getWorkspaceActivity,
  setupInitialUserWorkspace,
} from './src/lib/supabase.js';

// Global Application State
const appState = {
  isAnnualBilling: false,
  activeShowcaseTab: 'overview',
  activeDemoChapter: 1,
  isDemoPlaying: false,
  demoTimer: null,
  demoProgress: 25,
  currentUser: null,
  currentSession: null,
  currentWorkspace: null,
  realTasks: [],
};

// Bootstrap on DOM Ready
document.addEventListener('DOMContentLoaded', async () => {
  initLucide();
  initHeaderScroll();
  initMobileNavigation();
  initSmoothScroll();
  initHowItWorksSteps();
  initShowcaseTabs();
  initShowcaseTaskFilters();
  initShowcaseSearch();
  initPricingToggle();
  initFaqAccordion();
  initDemoVideoModal();
  initContactSalesModal();
  initLegalTriggers();

  // Supabase Auth and Dashboard Initialization
  initBackendStatusIndicator();
  await initSupabaseAuth();
  initTaskCreationModal();
  initHeroAndShowcaseTasks();
});

// Re-run Lucide icon parser whenever DOM changes
function initLucide() {
  createIcons({ icons });
}

/* ==========================================================================
   TOAST NOTIFICATION ENGINE
   ========================================================================== */
function showToast(message, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';

  const iconSvg =
    type === 'success'
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>'
      : type === 'error'
      ? '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#f43f5e" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>'
      : '<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#38bdf8" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>';

  toast.innerHTML = `${iconSvg}<span>${message}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(30px)';
    toast.style.transition = 'all 0.3s ease';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

/* ==========================================================================
   BACKEND & AUTHENTICATION STATE SYNCHRONIZATION
   ========================================================================== */
function initBackendStatusIndicator() {
  const pill = document.getElementById('backendStatusPill');
  const text = document.getElementById('backendStatusText');

  if (!pill || !text) return;

  if (isSupabaseConfigured) {
    pill.classList.remove('error');
    text.textContent = 'Supabase Connected';
    pill.title = 'Active PostgreSQL connection: whsfbpahcsvocvtwibzs.supabase.co';
  } else {
    pill.classList.add('error');
    text.textContent = 'Backend Disconnected';
    pill.title = 'Missing VITE_SUPABASE_URL or VITE_SUPABASE_PUBLISHABLE_KEY in .env';
  }
}

async function initSupabaseAuth() {
  // Check existing session
  const session = await getCurrentSession();
  if (session?.user) {
    appState.currentUser = session.user;
    appState.currentSession = session;
    await syncUserSessionState(session.user);
  } else {
    updateNavAuthUI(null);
  }

  // Subscribe to real-time auth changes
  onAuthStateChange(async (event, session) => {
    if (session?.user) {
      appState.currentUser = session.user;
      appState.currentSession = session;
      await syncUserSessionState(session.user);
    } else {
      appState.currentUser = null;
      appState.currentSession = null;
      appState.currentWorkspace = null;
      appState.realTasks = [];
      updateNavAuthUI(null);
    }
  });

  // Wire auth modal logic
  initAuthModal();
}

/**
 * Synchronizes user data, active workspace, and tasks after login
 */
async function syncUserSessionState(user) {
  updateNavAuthUI(user);

  try {
    const workspaces = await getUserWorkspaces(user.id);
    if (workspaces && workspaces.length > 0) {
      appState.currentWorkspace = workspaces[0];
    } else {
      // Create initial workspace for new user if none found
      const userMeta = user.user_metadata || {};
      const wsName = userMeta.initial_workspace || `${user.email.split('@')[0]}'s Workspace`;
      const fullName = userMeta.full_name || user.email.split('@')[0];
      const createdWs = await setupInitialUserWorkspace(user, wsName, fullName);
      if (createdWs) {
        appState.currentWorkspace = createdWs;
      }
    }

    if (appState.currentWorkspace) {
      await loadRealWorkspaceData(appState.currentWorkspace.id);
    }
  } catch (err) {
    console.warn('[LaunchFlow] Workspaces sync info:', err.message);
  }
}

function updateNavAuthUI(user) {
  const guestActions = document.getElementById('authGuestActions');
  const userProfile = document.getElementById('authUserProfile');
  const navUserName = document.getElementById('navUserName');
  const navUserAvatar = document.getElementById('navUserAvatar');
  const mobileSignInBtn = document.getElementById('mobileSignInBtn');
  const mobileSignUpBtn = document.getElementById('mobileSignUpBtn');

  if (user) {
    guestActions?.classList.add('hidden');
    userProfile?.classList.remove('hidden');

    const name = user.user_metadata?.full_name || user.email.split('@')[0];
    const initials = name
      .split(' ')
      .map((n) => n[0])
      .join('')
      .toUpperCase()
      .slice(0, 2);

    if (navUserName) navUserName.textContent = name;
    if (navUserAvatar) navUserAvatar.textContent = initials || 'LF';

    if (mobileSignInBtn) {
      mobileSignInBtn.textContent = 'Sign Out';
      mobileSignInBtn.onclick = handleSignOut;
    }
    if (mobileSignUpBtn) {
      mobileSignUpBtn.textContent = 'Active Workspace';
      mobileSignUpBtn.onclick = () => {
        document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' });
      };
    }
  } else {
    guestActions?.classList.remove('hidden');
    userProfile?.classList.add('hidden');

    if (mobileSignInBtn) {
      mobileSignInBtn.textContent = 'Sign In';
      mobileSignInBtn.onclick = () => openAuthModal('signin');
    }
    if (mobileSignUpBtn) {
      mobileSignUpBtn.textContent = 'Get Started Free';
      mobileSignUpBtn.onclick = () => openAuthModal('signup');
    }
  }

  // Sign out button
  const signOutBtn = document.getElementById('navSignOutBtn');
  if (signOutBtn) {
    signOutBtn.onclick = handleSignOut;
  }
}

async function handleSignOut() {
  try {
    await signOutUser();
    showToast('Signed out of LaunchFlow workspace.', 'info');
    window.location.reload();
  } catch (err) {
    showToast(`Error signing out: ${err.message}`, 'error');
  }
}

/**
 * Loads real tasks from Supabase and updates the showcase
 */
async function loadRealWorkspaceData(workspaceId) {
  try {
    const tasks = await getWorkspaceTasks(workspaceId, 'all');
    appState.realTasks = tasks;
    renderTasksToShowcase(tasks);

    // Update workspace header labels if present
    const boardTitle = document.querySelector('.dash-board-title');
    if (boardTitle && appState.currentWorkspace) {
      boardTitle.textContent = `${appState.currentWorkspace.name} • Active Sprint`;
    }
  } catch (err) {
    console.error('[LaunchFlow] Failed loading workspace tasks:', err);
  }
}

function renderTasksToShowcase(tasks) {
  const container = document.getElementById('interactiveTaskList');
  if (!container || !tasks || tasks.length === 0) return;

  container.innerHTML = '';

  tasks.forEach((task) => {
    const isCompleted = task.status === 'completed';
    const row = document.createElement('div');
    row.className = 'demo-task-row';
    row.setAttribute('data-status', task.status);
    row.setAttribute('data-task-id', task.id);

    const categoryChipClass =
      task.category === 'Backend'
        ? 'chip-infra'
        : task.category === 'Security'
        ? 'chip-security'
        : task.category === 'Design System'
        ? 'chip-design'
        : 'chip-frontend';

    const statusPillClass = isCompleted ? 'status-pill-done' : 'status-pill-progress';
    const statusText = isCompleted ? 'Completed' : task.status === 'in-progress' ? 'In Progress' : 'Todo';

    row.innerHTML = `
      <div class="task-checkbox-btn ${isCompleted ? 'checked' : ''}" role="checkbox" aria-checked="${isCompleted}" tabindex="0">
        <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="${isCompleted ? '' : 'hidden'}"><polyline points="20 6 9 17 4 12"/></svg>
      </div>
      <div class="task-main">
        <span class="task-name">${task.title}</span>
        <div class="task-meta-chips">
          <span class="chip-badge ${categoryChipClass}">${task.category || 'Feature'}</span>
          <span class="chip-sub">${task.priority ? task.priority.toUpperCase() : 'P2'}</span>
        </div>
      </div>
      <div class="task-assignee-avatar" title="${task.assignee_name || 'Team'}">${(task.assignee_name || 'LF').slice(0, 2).toUpperCase()}</div>
      <span class="${statusPillClass}">${statusText}</span>
    `;

    // Wire checkbox click to real Supabase update
    const checkbox = row.querySelector('.task-checkbox-btn');
    checkbox.addEventListener('click', async (e) => {
      e.stopPropagation();
      await toggleRealTaskStatus(task, row);
    });

    container.appendChild(row);
  });
}

async function toggleRealTaskStatus(task, rowElement) {
  const currentCompleted = rowElement.getAttribute('data-status') === 'completed';
  const newStatus = currentCompleted ? 'in-progress' : 'completed';

  try {
    if (task.id && typeof task.id === 'string' && task.id.length > 10) {
      await updateTaskStatus(task.id, newStatus);
    }

    rowElement.setAttribute('data-status', newStatus);
    const box = rowElement.querySelector('.task-checkbox-btn');
    const svg = box?.querySelector('svg');
    const pill = rowElement.querySelector('.status-pill-done, .status-pill-progress');

    if (newStatus === 'completed') {
      box?.classList.add('checked');
      box?.setAttribute('aria-checked', 'true');
      svg?.classList.remove('hidden');
      if (pill) {
        pill.className = 'status-pill-done';
        pill.textContent = 'Completed';
      }
      showToast('Task marked complete in Supabase ✓', 'success');
    } else {
      box?.classList.remove('checked');
      box?.setAttribute('aria-checked', 'false');
      svg?.classList.add('hidden');
      if (pill) {
        pill.className = 'status-pill-progress';
        pill.textContent = 'In Progress';
      }
      showToast('Task moved to In Progress', 'info');
    }
  } catch (err) {
    showToast(`Error updating task: ${err.message}`, 'error');
  }
}

/* ==========================================================================
   AUTHENTICATION MODAL FLOW (SIGN UP, SIGN IN, PASSWORD RESET)
   ========================================================================== */
function initAuthModal() {
  const modal = document.getElementById('authModal');
  const closeBtn = document.getElementById('closeAuthModal');
  const tabSignup = document.getElementById('tabSignupBtn');
  const tabSignin = document.getElementById('tabSigninBtn');
  const signupForm = document.getElementById('signupForm');
  const modalTitle = document.getElementById('authModalTitle');
  const authBtnText = document.getElementById('authBtnText');
  const groupFullName = document.getElementById('groupFullName');
  const groupWorkspace = document.getElementById('groupWorkspace');
  const successState = document.getElementById('authSuccessState');
  const finishAuthBtn = document.getElementById('finishAuthBtn');
  const authAlert = document.getElementById('authGlobalAlert');
  const authAlertText = document.getElementById('authAlertText');
  const forgotPasswordBtn = document.getElementById('forgotPasswordBtn');
  const passwordResetView = document.getElementById('passwordResetView');
  const backToSignInBtn = document.getElementById('backToSignInBtn');
  const sendResetBtn = document.getElementById('sendResetBtn');
  const resetEmail = document.getElementById('resetEmail');
  const resetError = document.getElementById('resetError');

  // Input Fields
  const nameInput = document.getElementById('signupName');
  const emailInput = document.getElementById('signupEmail');
  const workspaceInput = document.getElementById('signupWorkspace');
  const passwordInput = document.getElementById('signupPassword');

  let currentAuthTab = 'signup';

  function setAuthTab(tab) {
    currentAuthTab = tab;
    clearErrors();
    hideAlert();
    signupForm?.classList.remove('hidden');
    passwordResetView?.classList.add('hidden');

    if (tab === 'signup') {
      tabSignup?.classList.add('active');
      tabSignin?.classList.remove('active');
      if (modalTitle) modalTitle.textContent = 'Get Started with LaunchFlow';
      if (authBtnText) authBtnText.textContent = 'Create Free Workspace';
      if (groupFullName) groupFullName.style.display = 'block';
      if (groupWorkspace) groupWorkspace.style.display = 'block';
      forgotPasswordBtn?.classList.add('hidden');
    } else {
      tabSignin?.classList.add('active');
      tabSignup?.classList.remove('active');
      if (modalTitle) modalTitle.textContent = 'Sign In to LaunchFlow';
      if (authBtnText) authBtnText.textContent = 'Sign In with Supabase';
      if (groupFullName) groupFullName.style.display = 'none';
      if (groupWorkspace) groupWorkspace.style.display = 'none';
      forgotPasswordBtn?.classList.remove('hidden');
    }
  }

  tabSignup?.addEventListener('click', () => setAuthTab('signup'));
  tabSignin?.addEventListener('click', () => setAuthTab('signin'));

  function showAlert(msg, isError = true) {
    if (!authAlert || !authAlertText) return;
    authAlertText.textContent = msg;
    authAlert.className = `auth-alert-box ${isError ? 'error' : 'success'}`;
    authAlert.classList.remove('hidden');
  }

  function hideAlert() {
    authAlert?.classList.add('hidden');
  }

  function clearErrors() {
    ['nameError', 'emailError', 'workspaceError', 'passwordError', 'resetError'].forEach((id) => {
      const el = document.getElementById(id);
      if (el) el.textContent = '';
    });
  }

  function validateEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  }

  // Forgot password click
  forgotPasswordBtn?.addEventListener('click', () => {
    signupForm?.classList.add('hidden');
    passwordResetView?.classList.remove('hidden');
    if (resetEmail && emailInput) {
      resetEmail.value = emailInput.value;
    }
  });

  backToSignInBtn?.addEventListener('click', () => {
    passwordResetView?.classList.add('hidden');
    signupForm?.classList.remove('hidden');
  });

  sendResetBtn?.addEventListener('click', async () => {
    const email = resetEmail?.value.trim();
    if (!email || !validateEmail(email)) {
      if (resetError) resetError.textContent = 'Please enter a valid email address.';
      return;
    }

    sendResetBtn.disabled = true;
    sendResetBtn.textContent = 'Sending...';

    try {
      await resetPassword(email);
      showToast('Password reset link sent to your email!', 'success');
      passwordResetView?.classList.add('hidden');
      setAuthTab('signin');
      showAlert('Password reset email dispatched. Check your inbox.', false);
    } catch (err) {
      if (resetError) resetError.textContent = err.message;
    } finally {
      sendResetBtn.disabled = false;
      sendResetBtn.textContent = 'Send Recovery Link';
    }
  });

  // Submit Authentication Form (Sign Up or Sign In)
  signupForm?.addEventListener('submit', async (e) => {
    e.preventDefault();
    clearErrors();
    hideAlert();
    let hasError = false;

    const email = emailInput?.value.trim();
    const password = passwordInput?.value;
    const fullName = nameInput?.value.trim();
    const workspaceName = workspaceInput?.value.trim();

    if (currentAuthTab === 'signup') {
      if (!fullName || fullName.length < 2) {
        document.getElementById('nameError').textContent = 'Please enter your full name (min 2 characters).';
        hasError = true;
      }
      if (!workspaceName || workspaceName.length < 3) {
        document.getElementById('workspaceError').textContent = 'Workspace name must be at least 3 characters.';
        hasError = true;
      }
    }

    if (!email || !validateEmail(email)) {
      document.getElementById('emailError').textContent = 'Please enter a valid work email address.';
      hasError = true;
    }

    if (!password || password.length < 8) {
      document.getElementById('passwordError').textContent = 'Password must be at least 8 characters.';
      hasError = true;
    }

    if (hasError) return;

    const submitBtn = document.getElementById('submitAuthBtn');
    submitBtn.disabled = true;
    if (authBtnText) {
      authBtnText.textContent = currentAuthTab === 'signup' ? 'Creating Workspace...' : 'Authenticating...';
    }

    try {
      if (currentAuthTab === 'signup') {
        // Real Supabase Registration
        const { user, session } = await signUpUser({
          email,
          password,
          fullName,
          workspaceName,
        });

        submitBtn.disabled = false;
        if (authBtnText) authBtnText.textContent = 'Create Free Workspace';

        if (session) {
          // Immediately logged in
          signupForm.classList.add('hidden');
          successState?.classList.remove('hidden');
          const successMsg = document.getElementById('successWorkspaceMsg');
          if (successMsg) {
            successMsg.innerHTML = `Welcome <strong>${fullName}</strong>! Your workspace <strong>"${workspaceName}"</strong> has been created in Supabase.`;
          }
        } else if (user) {
          // Email confirmation required
          showAlert(
            'Account registered! If confirmation is enabled on this Supabase project, check your email inbox to activate.',
            false
          );
          showToast('Sign up successful! Please check your email.', 'success');
        }
      } else {
        // Real Supabase Login
        const data = await signInUser({ email, password });
        submitBtn.disabled = false;
        if (authBtnText) authBtnText.textContent = 'Sign In with Supabase';

        if (data?.session) {
          closeAuthModal();
          showToast(`Welcome back, ${data.user.email}!`, 'success');
        }
      }
    } catch (err) {
      submitBtn.disabled = false;
      if (authBtnText) {
        authBtnText.textContent = currentAuthTab === 'signup' ? 'Create Free Workspace' : 'Sign In with Supabase';
      }

      console.error('[LaunchFlow Auth Error]', err);
      showAlert(err.message || 'Authentication error. Please check your credentials.', true);
    }
  });

  finishAuthBtn?.addEventListener('click', () => {
    closeAuthModal();
    showToast('Entered workspace! Syncing sprint telemetry...', 'success');
    document.getElementById('showcase')?.scrollIntoView({ behavior: 'smooth' });
  });

  closeBtn?.addEventListener('click', closeAuthModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeAuthModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) {
      closeAuthModal();
    }
  });
}

function openAuthModal(tab = 'signup', planLabel = '') {
  const modal = document.getElementById('authModal');
  const signupForm = document.getElementById('signupForm');
  const successState = document.getElementById('authSuccessState');
  const passwordResetView = document.getElementById('passwordResetView');

  signupForm?.classList.remove('hidden');
  successState?.classList.add('hidden');
  passwordResetView?.classList.add('hidden');

  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  const tabSignup = document.getElementById('tabSignupBtn');
  const tabSignin = document.getElementById('tabSigninBtn');
  if (tab === 'signin') {
    tabSignin?.click();
  } else {
    tabSignup?.click();
  }

  if (planLabel) {
    showToast(`Selected: ${planLabel}`, 'info');
  }
}

function closeAuthModal() {
  const modal = document.getElementById('authModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

/* ==========================================================================
   TASK CREATION MODAL & DASHBOARD WIDGETS
   ========================================================================== */
function initTaskCreationModal() {
  const modal = document.getElementById('taskModal');
  const closeBtn = document.getElementById('closeTaskModal');
  const form = document.getElementById('createTaskForm');
  const titleInput = document.getElementById('taskInputTitle');
  const categoryInput = document.getElementById('taskInputCategory');
  const priorityInput = document.getElementById('taskInputPriority');
  const assigneeInput = document.getElementById('taskInputAssignee');
  const titleError = document.getElementById('taskTitleError');

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (titleError) titleError.textContent = '';

    const title = titleInput?.value.trim();
    if (!title || title.length < 3) {
      if (titleError) titleError.textContent = 'Please enter a descriptive task title (min 3 characters).';
      return;
    }

    const category = categoryInput?.value || 'Engineering';
    const priority = priorityInput?.value || 'medium';
    const assignee = assigneeInput?.value.trim() || 'Team Member';

    const submitBtn = document.getElementById('submitCreateTaskBtn');
    submitBtn.disabled = true;

    try {
      if (appState.currentWorkspace && appState.currentUser) {
        // Save to real Supabase database
        await createTask({
          workspace_id: appState.currentWorkspace.id,
          title,
          category,
          priority,
          assignee_name: assignee,
          created_by: appState.currentUser.id,
          status: 'in-progress',
        });
        showToast(`Task "${title}" saved to Supabase!`, 'success');
        await loadRealWorkspaceData(appState.currentWorkspace.id);
      } else {
        // Guest mode simulation
        appendTaskToGuestBoard({
          title,
          category,
          priority,
          assignee_name: assignee,
          status: 'in-progress',
        });
        showToast(`Task "${title}" created (Sign in to persist to cloud)`, 'info');
      }

      form.reset();
      closeTaskModal();
    } catch (err) {
      showToast(`Error creating task: ${err.message}`, 'error');
    } finally {
      submitBtn.disabled = false;
    }
  });

  closeBtn?.addEventListener('click', closeTaskModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeTaskModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) {
      closeTaskModal();
    }
  });
}

function openTaskModal() {
  const modal = document.getElementById('taskModal');
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

function closeTaskModal() {
  const modal = document.getElementById('taskModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

function appendTaskToGuestBoard(task) {
  const container = document.getElementById('interactiveTaskList');
  if (!container) return;

  const row = document.createElement('div');
  row.className = 'demo-task-row';
  row.setAttribute('data-status', 'in-progress');

  row.innerHTML = `
    <div class="task-checkbox-btn" role="checkbox" aria-checked="false" tabindex="0">
      <svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" class="hidden"><polyline points="20 6 9 17 4 12"/></svg>
    </div>
    <div class="task-main">
      <span class="task-name">${task.title}</span>
      <div class="task-meta-chips">
        <span class="chip-badge chip-frontend">${task.category}</span>
        <span class="chip-sub">${task.priority.toUpperCase()}</span>
      </div>
    </div>
    <div class="task-assignee-avatar">${task.assignee_name.slice(0, 2).toUpperCase()}</div>
    <span class="status-pill-progress">In Progress</span>
  `;

  container.prepend(row);
  initShowcaseCheckboxToggles();
}

function initHeroAndShowcaseTasks() {
  // Hero buttons
  document.getElementById('heroStartFreeBtn')?.addEventListener('click', () => openAuthModal('signup'));
  document.getElementById('navSignUpBtn')?.addEventListener('click', () => openAuthModal('signup'));
  document.getElementById('navSignInBtn')?.addEventListener('click', () => openAuthModal('signin'));
  document.getElementById('heroWatchDemoBtn')?.addEventListener('click', () => openDemoModal());

  // Task creation triggers
  document.getElementById('heroAddIssueBtn')?.addEventListener('click', openTaskModal);

  // Announcement badge
  document.getElementById('announcementBadge')?.addEventListener('click', () => {
    showToast('LaunchFlow 2.4 Cloud Release loaded • Live Supabase Sync', 'info');
  });

  // Hero Task Checkbox Click
  const heroTaskItems = document.querySelectorAll('.dash-task-item');
  heroTaskItems.forEach((item) => {
    item.addEventListener('click', () => {
      const box = item.querySelector('.custom-checkbox');
      const isDone = item.classList.contains('completed');

      if (isDone) {
        item.classList.remove('completed');
        box.classList.remove('checked');
        box.querySelector('svg')?.classList.add('hidden');
        showToast('Hero task marked in progress', 'info');
      } else {
        item.classList.add('completed');
        box.classList.add('checked');
        box.querySelector('svg')?.classList.remove('hidden');
        showToast('Hero task marked complete!', 'success');
      }
    });
  });

  initShowcaseCheckboxToggles();
}

function initShowcaseCheckboxToggles() {
  const taskRows = document.querySelectorAll('.demo-task-row');

  taskRows.forEach((row) => {
    const checkbox = row.querySelector('.task-checkbox-btn');
    if (!checkbox || checkbox.dataset.bound) return;
    checkbox.dataset.bound = 'true';

    function toggleRowStatus() {
      const isCompleted = row.getAttribute('data-status') === 'completed';
      const checkIcon = checkbox.querySelector('svg');

      if (isCompleted) {
        row.setAttribute('data-status', 'in-progress');
        checkbox.classList.remove('checked');
        checkbox.setAttribute('aria-checked', 'false');
        checkIcon?.classList.add('hidden');

        const pill = row.querySelector('.status-pill-done, .status-pill-progress');
        if (pill) {
          pill.className = 'status-pill-progress';
          pill.textContent = 'In Progress';
        }
        showToast('Moved issue to In Progress', 'info');
      } else {
        row.setAttribute('data-status', 'completed');
        checkbox.classList.add('checked');
        checkbox.setAttribute('aria-checked', 'true');
        checkIcon?.classList.remove('hidden');

        const pill = row.querySelector('.status-pill-progress, .status-pill-done');
        if (pill) {
          pill.className = 'status-pill-done';
          pill.textContent = 'Completed';
        }
        showToast('Marked issue as Completed ✓', 'success');
      }
    }

    checkbox.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleRowStatus();
    });

    checkbox.addEventListener('keydown', (e) => {
      if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        toggleRowStatus();
      }
    });
  });
}

/* ==========================================================================
   NAVIGATION, STEPS, TABS & ACCORDIONS
   ========================================================================== */
function initHeaderScroll() {
  const header = document.getElementById('header');
  window.addEventListener(
    'scroll',
    () => {
      if (window.scrollY > 20) {
        header.classList.add('scrolled');
      } else {
        header.classList.remove('scrolled');
      }
    },
    { passive: true }
  );
}

function initMobileNavigation() {
  const menuBtn = document.getElementById('mobileMenuBtn');
  const drawer = document.getElementById('mobileMenu');
  const hamburger = document.getElementById('hamburgerIcon');
  const close = document.getElementById('closeIcon');
  const mobileLinks = document.querySelectorAll('.mobile-link');

  if (!menuBtn || !drawer) return;

  function toggleDrawer(open) {
    const isOpen = open !== undefined ? open : !drawer.classList.contains('open');
    drawer.classList.toggle('open', isOpen);
    menuBtn.setAttribute('aria-expanded', isOpen);
    drawer.setAttribute('aria-hidden', !isOpen);

    if (isOpen) {
      hamburger?.classList.add('hidden');
      close?.classList.remove('hidden');
      document.body.style.overflow = 'hidden';
    } else {
      hamburger?.classList.remove('hidden');
      close?.classList.add('hidden');
      document.body.style.overflow = '';
    }
  }

  menuBtn.addEventListener('click', () => toggleDrawer());
  mobileLinks.forEach((link) => {
    link.addEventListener('click', () => toggleDrawer(false));
  });

  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && drawer.classList.contains('open')) {
      toggleDrawer(false);
    }
  });
}

function initSmoothScroll() {
  const links = document.querySelectorAll('a[href^="#"]');
  const navLinks = document.querySelectorAll('.desktop-nav .nav-link');

  links.forEach((link) => {
    link.addEventListener('click', (e) => {
      const targetId = link.getAttribute('href');
      if (targetId === '#' || !targetId.startsWith('#')) return;

      const targetEl = document.querySelector(targetId);
      if (targetEl) {
        e.preventDefault();
        targetEl.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  const sections = document.querySelectorAll('section[id]');
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          const id = entry.target.getAttribute('id');
          navLinks.forEach((navLink) => {
            navLink.classList.toggle('active', navLink.getAttribute('href') === `#${id}`);
          });
        }
      });
    },
    { threshold: 0.35 }
  );

  sections.forEach((s) => observer.observe(s));
}

function initHowItWorksSteps() {
  const stepCards = document.querySelectorAll('.step-card');
  const howItWorksCta = document.getElementById('howItWorksCta');

  stepCards.forEach((card) => {
    card.addEventListener('click', () => {
      stepCards.forEach((c) => c.classList.remove('active'));
      card.classList.add('active');
    });
  });

  howItWorksCta?.addEventListener('click', () => openAuthModal('signup'));
}

function initShowcaseTabs() {
  const tabs = document.querySelectorAll('.showcase-tab');
  const panes = document.querySelectorAll('.tab-pane');

  tabs.forEach((tab) => {
    tab.addEventListener('click', () => {
      const targetTab = tab.getAttribute('data-tab');
      if (!targetTab) return;

      tabs.forEach((t) => {
        t.classList.remove('active');
        t.setAttribute('aria-selected', 'false');
      });
      panes.forEach((p) => p.classList.remove('active'));

      tab.classList.add('active');
      tab.setAttribute('aria-selected', 'true');

      const activePane = document.getElementById(`pane-${targetTab}`);
      if (activePane) {
        activePane.classList.add('active');
      }
      appState.activeShowcaseTab = targetTab;
    });
  });
}

function initShowcaseTaskFilters() {
  const filterBtns = document.querySelectorAll('#demoTaskFilters .filter-btn');
  const taskRows = document.querySelectorAll('.demo-task-row');

  filterBtns.forEach((btn) => {
    btn.addEventListener('click', () => {
      filterBtns.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');

      const filter = btn.getAttribute('data-filter');

      taskRows.forEach((row) => {
        const status = row.getAttribute('data-status');
        if (filter === 'all') {
          row.style.display = 'flex';
        } else if (filter === 'completed') {
          row.style.display = status === 'completed' ? 'flex' : 'none';
        } else if (filter === 'in-progress') {
          row.style.display = status === 'in-progress' ? 'flex' : 'none';
        }
      });
    });
  });
}

function initShowcaseSearch() {
  const searchInput = document.getElementById('showcaseSearch');
  searchInput?.addEventListener('input', (e) => {
    const query = e.target.value.toLowerCase().trim();
    const taskRows = document.querySelectorAll('.demo-task-row');
    taskRows.forEach((row) => {
      const taskName = row.querySelector('.task-name')?.textContent.toLowerCase() || '';
      const taskMeta = row.querySelector('.task-meta-chips')?.textContent.toLowerCase() || '';
      if (taskName.includes(query) || taskMeta.includes(query)) {
        row.style.display = 'flex';
      } else {
        row.style.display = 'none';
      }
    });
  });
}

function initPricingToggle() {
  const billingSwitch = document.getElementById('billingSwitch');
  const proPriceVal = document.getElementById('proPriceVal');
  const proPricePeriod = document.getElementById('proPricePeriod');
  const proPriceSubtext = document.getElementById('proPriceSubtext');
  const starterBtn = document.getElementById('starterCtaBtn');
  const proBtn = document.getElementById('proCtaBtn');
  const enterpriseBtn = document.getElementById('enterpriseCtaBtn');

  function updatePricing(annual) {
    appState.isAnnualBilling = annual;
    billingSwitch?.setAttribute('aria-checked', annual);

    if (annual) {
      if (proPriceVal) proPriceVal.textContent = '10';
      if (proPricePeriod) proPricePeriod.textContent = '/ user / mo';
      if (proPriceSubtext) proPriceSubtext.textContent = 'Billed annually ($120/yr) • Save 20%';
      showToast('Switched to Annual Billing (20% Savings applied!)', 'info');
    } else {
      if (proPriceVal) proPriceVal.textContent = '12';
      if (proPricePeriod) proPricePeriod.textContent = '/ user / mo';
      if (proPriceSubtext) proPriceSubtext.textContent = 'Billed monthly • Cancel anytime';
    }
  }

  billingSwitch?.addEventListener('click', () => updatePricing(!appState.isAnnualBilling));

  starterBtn?.addEventListener('click', () => openAuthModal('signup', 'Starter Plan ($0/mo)'));
  proBtn?.addEventListener('click', () => {
    const planText = appState.isAnnualBilling ? 'Pro Annual ($10/mo)' : 'Pro Monthly ($12/mo)';
    openAuthModal('signup', `${planText} - 14-Day Free Trial`);
  });
  enterpriseBtn?.addEventListener('click', openContactModal);
}

function initFaqAccordion() {
  const triggers = document.querySelectorAll('.accordion-trigger');
  triggers.forEach((trigger) => {
    trigger.addEventListener('click', () => {
      const isExpanded = trigger.getAttribute('aria-expanded') === 'true';
      const contentId = trigger.getAttribute('aria-controls');
      const content = document.getElementById(contentId);

      trigger.setAttribute('aria-expanded', !isExpanded);
      if (content) {
        content.hidden = isExpanded;
      }
    });
  });
}

/* ==========================================================================
   VIDEO DEMO & CONTACT SALES MODALS
   ========================================================================== */
function initDemoVideoModal() {
  const modal = document.getElementById('demoVideoModal');
  const closeBtn = document.getElementById('closeDemoModal');
  const playToggle = document.getElementById('playerPlayToggle');
  const playIcon = document.getElementById('playerPlayIcon');
  const pauseIcon = document.getElementById('playerPauseIcon');
  const scrubFill = document.getElementById('playerScrubFill');
  const scrubBar = document.getElementById('playerScrubBar');
  const timeDisplay = document.getElementById('playerTimeDisplay');
  const chapters = document.querySelectorAll('.chapter-item');
  const startTrialBtn = document.getElementById('demoModalStartTrialBtn');

  const chapterData = {
    1: {
      title: 'Automate Task Prioritization and Eliminate Blockers',
      desc: 'Watch how tickets automatically surface based on sprint urgency and dependency trees.',
      badge: 'Chapter 1: The Unified Board',
      time: '00:42 / 02:45',
      percent: 25,
    },
    2: {
      title: 'Real-Time Burndown Telemetry and Cycle Velocity',
      desc: 'Monitor sprint variance and team capacity with zero manual spreadsheet data entry.',
      badge: 'Chapter 2: Sprint & Task Telemetry',
      time: '01:15 / 02:45',
      percent: 45,
    },
    3: {
      title: 'Multiplayer Collaborative Canvas with Conflict-Free Sync',
      desc: 'Write product specifications simultaneously with real-time presence and inline comments.',
      badge: 'Chapter 3: Multiplayer Collaboration',
      time: '01:55 / 02:45',
      percent: 70,
    },
    4: {
      title: 'Automated Executive Digests and Release Orchestration',
      desc: 'Summarize weekly achievements into high-level reports delivered directly to Slack.',
      badge: 'Chapter 4: Executive Velocity Summaries',
      time: '02:30 / 02:45',
      percent: 92,
    },
  };

  function selectChapter(num) {
    appState.activeDemoChapter = num;
    chapters.forEach((c) => {
      c.classList.toggle('active', parseInt(c.getAttribute('data-chapter'), 10) === num);
    });

    const data = chapterData[num];
    if (data) {
      const slide = document.querySelector('.player-visual-slide');
      if (slide) {
        slide.querySelector('.slide-badge').textContent = data.badge;
        slide.querySelector('h3').textContent = data.title;
        slide.querySelector('p').textContent = data.desc;
      }
      if (scrubFill) scrubFill.style.width = `${data.percent}%`;
      if (timeDisplay) timeDisplay.textContent = data.time;
      appState.demoProgress = data.percent;
    }
  }

  chapters.forEach((chap) => {
    chap.addEventListener('click', () => {
      selectChapter(parseInt(chap.getAttribute('data-chapter'), 10));
    });
  });

  playToggle?.addEventListener('click', () => {
    appState.isDemoPlaying = !appState.isDemoPlaying;
    if (appState.isDemoPlaying) {
      playIcon?.classList.add('hidden');
      pauseIcon?.classList.remove('hidden');
      appState.demoTimer = setInterval(() => {
        appState.demoProgress += 1;
        if (appState.demoProgress > 100) appState.demoProgress = 10;
        if (scrubFill) scrubFill.style.width = `${appState.demoProgress}%`;
        if (timeDisplay) {
          timeDisplay.textContent = `01:${appState.demoProgress < 10 ? '0' : ''}${appState.demoProgress} / 02:45`;
        }
      }, 500);
      showToast('Simulated demo playback running', 'info');
    } else {
      playIcon?.classList.remove('hidden');
      pauseIcon?.classList.add('hidden');
      clearInterval(appState.demoTimer);
    }
  });

  scrubBar?.addEventListener('click', (e) => {
    const rect = scrubBar.getBoundingClientRect();
    const clickX = e.clientX - rect.left;
    const pct = Math.max(5, Math.min(100, Math.round((clickX / rect.width) * 100)));
    appState.demoProgress = pct;
    if (scrubFill) scrubFill.style.width = `${pct}%`;
  });

  startTrialBtn?.addEventListener('click', () => {
    closeDemoModal();
    openAuthModal('signup');
  });

  closeBtn?.addEventListener('click', closeDemoModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeDemoModal();
  });
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && modal?.classList.contains('open')) {
      closeDemoModal();
    }
  });
}

function openDemoModal() {
  const modal = document.getElementById('demoVideoModal');
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

function closeDemoModal() {
  const modal = document.getElementById('demoVideoModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
  if (appState.isDemoPlaying) {
    document.getElementById('playerPlayToggle')?.click();
  }
}

function initContactSalesModal() {
  const modal = document.getElementById('contactModal');
  const closeBtn = document.getElementById('closeContactModal');
  const contactForm = document.getElementById('contactSalesForm');
  const successState = document.getElementById('contactSuccessState');
  const closeSuccessBtn = document.getElementById('closeContactSuccessBtn');

  const nameInput = document.getElementById('contactName');
  const emailInput = document.getElementById('contactEmail');
  const sizeInput = document.getElementById('companySize');
  const msgInput = document.getElementById('contactMessage');

  contactForm?.addEventListener('submit', (e) => {
    e.preventDefault();
    let hasError = false;

    if (!nameInput?.value.trim()) {
      document.getElementById('contactNameError').textContent = 'Please provide your full name.';
      hasError = true;
    }
    if (!emailInput?.value.trim()) {
      document.getElementById('contactEmailError').textContent = 'Please provide a valid work email address.';
      hasError = true;
    }
    if (!sizeInput?.value) {
      document.getElementById('contactSizeError').textContent = 'Please select your team size.';
      hasError = true;
    }
    if (!msgInput?.value.trim()) {
      document.getElementById('contactMessageError').textContent = 'Please share your objectives.';
      hasError = true;
    }

    if (hasError) return;

    const submitBtn = document.getElementById('submitContactBtn');
    submitBtn.disabled = true;
    submitBtn.querySelector('span').textContent = 'Submitting Inquiry...';

    setTimeout(() => {
      submitBtn.disabled = false;
      submitBtn.querySelector('span').textContent = 'Submit Enterprise Inquiry';
      contactForm.classList.add('hidden');
      successState?.classList.remove('hidden');
    }, 800);
  });

  closeSuccessBtn?.addEventListener('click', closeContactModal);
  closeBtn?.addEventListener('click', closeContactModal);
  modal?.addEventListener('click', (e) => {
    if (e.target === modal) closeContactModal();
  });
}

function openContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) {
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }
}

function closeContactModal() {
  const modal = document.getElementById('contactModal');
  if (modal) {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }
}

function initLegalTriggers() {
  document.querySelectorAll('.demo-legal-trigger').forEach((trigger) => {
    trigger.addEventListener('click', (e) => {
      e.preventDefault();
      const type = trigger.getAttribute('data-legal');
      showToast(`Demo: ${type.toUpperCase()} policy documentation preview`, 'info');
    });
  });
}
