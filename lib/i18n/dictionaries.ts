// M13 — EN/ES message catalog. The SINGLE source of every user-facing string.
//
// `en` is the canonical shape; `es: Dict` makes TypeScript the "untranslated
// string" check — if `es` is missing any key `en` has, `tsc` fails. So adding a
// new English key forces a Spanish translation before the build passes.
//
// Templates use {placeholders} filled by interpolate() at render time, so the
// critical-path COMPUTATION (lib/critical-path.ts) stays language-agnostic and
// only the TEMPLATING lives here (INSTRUCTIONS.md M13).

export const en = {
  lang: { en: "English", es: "Español" },

  common: {
    signOut: "Sign out",
    job: "job",
    jobs: "jobs",
    readOnly: "read-only",
    viewOnly: "View only",
    archived: "Archived",
  },

  nav: {
    active: "Active",
    archived: "Archived",
    team: "Team",
    billing: "Billing",
    admin: "Admin",
  },

  dashboard: {
    yourName: "Your name",
    activeOne: "{n} active job",
    activeMany: "{n} active jobs",
    archivedOne: "{n} archived job",
    archivedMany: "{n} archived jobs",
    myJobs: "My jobs",
    teamJobs: "Team jobs",
    newJob: "New job",
    createJob: "Create job",
    open: "Open →",
    jobNamePlaceholder: "Job name (e.g. 1428 Oak St kitchen)",
    addressPlaceholder: "Address (optional)",
    customerPlaceholder: "Customer name (optional)",
    emptyOwnActive:
      "No jobs yet. Create your first one below — it starts with the standard phases.",
    emptyOwnArchived: "No archived jobs of yours.",
    jobCountOne: "{n} job",
    jobCountMany: "{n} jobs",
    trialEnded: "Your trial has ended — subscribe to create jobs →",
    subInactive: "Your subscription is {status} — subscribe to create jobs →",
  },

  status: {
    not_started: "Not started",
    in_progress: "In progress",
    blocked: "Blocked",
    done: "Done",
  },

  subStatus: {
    trialing: "on trial",
    active: "active",
    past_due: "past due",
    canceled: "canceled",
  },

  headline: {
    empty: "No phases yet — add one to start tracking.",
    done: "All phases complete.",
    blocked: "BLOCKED: {frontier} — waiting on {reason}.",
    blockedNext:
      "BLOCKED: {frontier} — waiting on {reason}. Next phase ({next}) can’t start until this clears.",
    inProgress: "IN PROGRESS: {frontier}.",
    inProgressNext: "IN PROGRESS: {frontier} — next up: {next}.",
    ready: "READY TO START: {frontier} — nothing upstream is blocking.",
    downstream: "Also blocked downstream: {labels}.",
  },

  job: {
    back: "← Jobs",
    archive: "Archive",
    unarchive: "Unarchive",
    nameAria: "Job name",
  },

  board: {
    edit: "Edit phases",
    doneEditing: "Done editing",
    phaseNameAria: "Phase name",
    assignToAria: "Assign to",
    unassigned: "Unassigned",
    addCrewHint: "Add crew below, then assign them here.",
    up: "↑ Up",
    down: "↓ Down",
    delete: "Delete",
    moveUpAria: "Move up",
    moveDownAria: "Move down",
    deleteConfirm: 'Delete phase "{label}"?',
    waitingOnPlaceholder: "Waiting on…",
    save: "Save",
    waitingOn: "⛔ Waiting on {reason}",
    addPhasePlaceholder: "Add a phase…",
    add: "Add",
  },

  crew: {
    title: "Crew",
    description:
      "Text a link to a sub — it opens this board with no sign-in. They update only the phases you assign them.",
    revoke: "Revoke",
    revokeConfirm: "Revoke {name}'s link? It will stop working.",
    copyLink: "Copy link",
    copied: "Copied!",
    textIt: "Text it",
    textBody: "Update your phases here: {link}",
    subName: "Sub name",
    phonePlaceholder: "Phone (optional)",
    add: "Add",
  },

  participant: {
    greeting: "Hi {name}",
    jobFallback: "Job",
    nothingAssigned: "Nothing assigned to you yet.",
    nothingAssignedHint:
      "Your contractor will assign your work shortly — this page updates automatically, no need to refresh.",
    linkInactive: "This link isn’t active",
    linkInactiveHint:
      "It may have been revoked or it’s incorrect. Ask the contractor to text you a fresh link.",
  },

  auth: {
    ownerSignIn: "Owner sign in",
    subtitle:
      "Enter your email and we’ll send you a one-tap sign-in link. No password.",
    emailLabel: "Email",
    emailPlaceholder: "you@company.com",
    sendLink: "Send sign-in link",
    checkEmail: "Check your email for the sign-in link. You can close this tab.",
    genericError: "Something went wrong sending the link. Try again.",
    enterEmail: "Enter your email address.",
    notApproved:
      "This email isn’t approved yet. Ask your contractor for an invite, or contact us for access.",
  },

  landing: {
    tagline:
      "One shared status board per job. Each trade taps Done, In progress, or Blocked — and the owner sees the one thing blocking the next phase.",
    healthCheck: "Health check",
  },

  team: {
    back: "← Dashboard",
    description:
      "Add a salesman’s name and email and tap Invite — we email them a one-tap sign-in link automatically. They can view all jobs and edit only their own.",
    seatsFull:
      "You’ve used all {limit} salesman seats. Remove one below, or contact us to raise your limit.",
    nameLabel: "Name",
    namePlaceholder: "Salesman name",
    emailLabel: "Email",
    emailPlaceholder: "salesman@company.com",
    invite: "Invite salesman",
    salesmenHeading: "Salesmen ({n}/{limit})",
    empty: "No salesmen yet. Invite your first above.",
    joined: "Joined",
    invited: "Invited",
    remove: "Remove",
  },

  billing: {
    back: "← Dashboard",
    trialing: "You’re on a free trial.",
    active: "Your subscription is active.",
    pastDue: "Your last payment failed — update your card to keep access.",
    canceled: "Your subscription is canceled.",
    statusFallback: "Status: {status}",
    planLabel: "Monthly plan",
    notConfigured:
      "Billing isn’t set up yet. You can keep using the app during the trial.",
    ownerOnly: "Owner-only — subcontractors never see billing.",
    manage: "Manage billing",
    subscribe: "Subscribe",
  },

  email: {
    signInSubject: "Your sign-in link for Coordination Board",
    signInHeading: "Sign in to Coordination Board",
    signInBody:
      "Tap below to sign in. No password — and it works on any device or browser, even if that’s different from where you requested this link.",
    signInButton: "Sign in to Coordination Board",
    signInFooter: "If you didn’t request this, you can ignore this email.",
    inviteSubject: "You’re invited to {org} on Coordination Board",
    inviteHeading: "You’re on the team at {org}",
    inviteBody:
      "Tap below to sign in to your job board. No password, no setup — it opens straight to the jobs assigned to you.",
    inviteButton: "Sign in to Coordination Board",
    inviteFooter: "If you didn’t expect this, you can ignore this email.",
  },

  authConfirm: {
    title: "Finish signing in",
    heading: "Almost there",
    body: "Tap below to finish signing in to Coordination Board.",
    button: "Sign in",
    missing: "Sign-in link was missing or invalid.",
    verifyFailed: "Sign-in link couldn’t be verified — request a fresh one.",
    sameBrowser:
      "Couldn’t complete sign-in — open the link in the same browser you requested it from.",
  },

  admin: {
    back: "← Dashboard",
    accounts: "Accounts ({n})",
    trial14: "Trial +14d",
    comp: "Comp (active)",
    endTrial: "End trial",
    cancel: "Cancel",
    delete: "Delete",
    deleteConfirm:
      "Permanently delete {who} and ALL their jobs? This cannot be undone.",
    salesmanName: "Salesman name",
    salesmanEmail: "salesman@email.com",
    addSalesman: "Add salesman",
    ownerList: "Owner List ({n})",
    ownerListDesc:
      "Approved business owners. An email here can sign in, gets its own company, and can invite its own salesmen. Salesmen are invited by their owner — they are not added here.",
    remove: "Remove",
    ownerEmailPlaceholder: "owner@company.com",
    add: "Add",
    daysLeft: "· {d}d left",
  },

  misc: {
    companyNameAria: "Your company name",
    metaDescription:
      "One shared status board per job. Each trade taps Done / In progress / Blocked, and the owner sees the one thing blocking the next phase.",
  },

  pwa: {
    installLead: "Install: tap",
    installMid: "Share, then",
    addToHomeScreen: "Add to Home Screen",
    dismiss: "Dismiss",
  },

  health: {
    heading: "Health",
    scaffold: "Coordination Board — M0 scaffold",
    allOk: "App is running and all environment variables are present.",
    someMissing:
      "App is running, but some environment variables are missing. Copy .env.local.example to .env.local and fill them in.",
    present: "present",
    missing: "missing",
  },
};

// No `as const`: leaf types widen to `string`, so `Dict` enforces that `es` has
// every key `en` does (the untranslated-string check) without demanding the
// Spanish values equal the English literals.
export type Dict = typeof en;
export type Lang = "en" | "es";

export const es: Dict = {
  lang: { en: "English", es: "Español" },

  common: {
    signOut: "Cerrar sesión",
    job: "trabajo",
    jobs: "trabajos",
    readOnly: "solo lectura",
    viewOnly: "Solo lectura",
    archived: "Archivado",
  },

  nav: {
    active: "Activos",
    archived: "Archivados",
    team: "Equipo",
    billing: "Facturación",
    admin: "Admin",
  },

  dashboard: {
    yourName: "Tu nombre",
    activeOne: "{n} trabajo activo",
    activeMany: "{n} trabajos activos",
    archivedOne: "{n} trabajo archivado",
    archivedMany: "{n} trabajos archivados",
    myJobs: "Mis trabajos",
    teamJobs: "Trabajos del equipo",
    newJob: "Nuevo trabajo",
    createJob: "Crear trabajo",
    open: "Abrir →",
    jobNamePlaceholder: "Nombre del trabajo (ej. cocina 1428 Oak St)",
    addressPlaceholder: "Dirección (opcional)",
    customerPlaceholder: "Nombre del cliente (opcional)",
    emptyOwnActive:
      "Aún no hay trabajos. Crea el primero abajo — empieza con las fases estándar.",
    emptyOwnArchived: "No tienes trabajos archivados.",
    jobCountOne: "{n} trabajo",
    jobCountMany: "{n} trabajos",
    trialEnded:
      "Tu prueba ha terminado — suscríbete para crear trabajos →",
    subInactive:
      "Tu suscripción está {status} — suscríbete para crear trabajos →",
  },

  status: {
    not_started: "Sin empezar",
    in_progress: "En progreso",
    blocked: "Bloqueado",
    done: "Hecho",
  },

  subStatus: {
    trialing: "en prueba",
    active: "activa",
    past_due: "vencida",
    canceled: "cancelada",
  },

  headline: {
    empty: "Aún no hay fases — agrega una para empezar a dar seguimiento.",
    done: "Todas las fases completas.",
    blocked: "BLOQUEADO: {frontier} — esperando {reason}.",
    blockedNext:
      "BLOQUEADO: {frontier} — esperando {reason}. La siguiente fase ({next}) no puede empezar hasta que se resuelva.",
    inProgress: "EN PROGRESO: {frontier}.",
    inProgressNext: "EN PROGRESO: {frontier} — sigue: {next}.",
    ready: "LISTO PARA EMPEZAR: {frontier} — nada lo bloquea.",
    downstream: "También bloqueado más adelante: {labels}.",
  },

  job: {
    back: "← Trabajos",
    archive: "Archivar",
    unarchive: "Desarchivar",
    nameAria: "Nombre del trabajo",
  },

  board: {
    edit: "Editar fases",
    doneEditing: "Listo",
    phaseNameAria: "Nombre de la fase",
    assignToAria: "Asignar a",
    unassigned: "Sin asignar",
    addCrewHint: "Agrega cuadrilla abajo y luego asígnala aquí.",
    up: "↑ Subir",
    down: "↓ Bajar",
    delete: "Eliminar",
    moveUpAria: "Subir",
    moveDownAria: "Bajar",
    deleteConfirm: '¿Eliminar la fase "{label}"?',
    waitingOnPlaceholder: "Esperando…",
    save: "Guardar",
    waitingOn: "⛔ Esperando {reason}",
    addPhasePlaceholder: "Agregar una fase…",
    add: "Agregar",
  },

  crew: {
    title: "Cuadrilla",
    description:
      "Envía un enlace por mensaje a un sub — abre este tablero sin iniciar sesión. Solo actualizan las fases que les asignes.",
    revoke: "Revocar",
    revokeConfirm: "¿Revocar el enlace de {name}? Dejará de funcionar.",
    copyLink: "Copiar enlace",
    copied: "¡Copiado!",
    textIt: "Enviar",
    textBody: "Actualiza tus fases aquí: {link}",
    subName: "Nombre del sub",
    phonePlaceholder: "Teléfono (opcional)",
    add: "Agregar",
  },

  participant: {
    greeting: "Hola {name}",
    jobFallback: "Trabajo",
    nothingAssigned: "Aún no tienes nada asignado.",
    nothingAssignedHint:
      "Tu contratista te asignará trabajo en breve — esta página se actualiza automáticamente, no necesitas refrescar.",
    linkInactive: "Este enlace no está activo",
    linkInactiveHint:
      "Puede haber sido revocado o es incorrecto. Pídele al contratista que te envíe un enlace nuevo.",
  },

  auth: {
    ownerSignIn: "Inicio de sesión",
    subtitle:
      "Ingresa tu correo y te enviaremos un enlace de acceso de un toque. Sin contraseña.",
    emailLabel: "Correo",
    emailPlaceholder: "tu@empresa.com",
    sendLink: "Enviar enlace de acceso",
    checkEmail:
      "Revisa tu correo para el enlace de acceso. Puedes cerrar esta pestaña.",
    genericError: "Algo salió mal al enviar el enlace. Inténtalo de nuevo.",
    enterEmail: "Ingresa tu correo electrónico.",
    notApproved:
      "Este correo aún no está aprobado. Pídele una invitación a tu contratista, o contáctanos para obtener acceso.",
  },

  landing: {
    tagline:
      "Un tablero de estado compartido por trabajo. Cada oficio toca Hecho, En progreso o Bloqueado — y el dueño ve lo único que detiene la siguiente fase.",
    healthCheck: "Estado del sistema",
  },

  team: {
    back: "← Tablero",
    description:
      "Agrega el nombre y correo de un vendedor y toca Invitar — le enviamos un enlace de acceso de un toque automáticamente. Puede ver todos los trabajos y editar solo los suyos.",
    seatsFull:
      "Has usado los {limit} lugares de vendedor. Elimina uno abajo, o contáctanos para aumentar tu límite.",
    nameLabel: "Nombre",
    namePlaceholder: "Nombre del vendedor",
    emailLabel: "Correo",
    emailPlaceholder: "vendedor@empresa.com",
    invite: "Invitar vendedor",
    salesmenHeading: "Vendedores ({n}/{limit})",
    empty: "Aún no hay vendedores. Invita al primero arriba.",
    joined: "Unido",
    invited: "Invitado",
    remove: "Eliminar",
  },

  billing: {
    back: "← Tablero",
    trialing: "Estás en una prueba gratis.",
    active: "Tu suscripción está activa.",
    pastDue: "Tu último pago falló — actualiza tu tarjeta para mantener el acceso.",
    canceled: "Tu suscripción está cancelada.",
    statusFallback: "Estado: {status}",
    planLabel: "Plan mensual",
    notConfigured:
      "La facturación aún no está configurada. Puedes seguir usando la app durante la prueba.",
    ownerOnly: "Solo para el dueño — los subcontratistas nunca ven la facturación.",
    manage: "Administrar facturación",
    subscribe: "Suscribirse",
  },

  email: {
    signInSubject: "Tu enlace de acceso para Coordination Board",
    signInHeading: "Inicia sesión en Coordination Board",
    signInBody:
      "Toca abajo para iniciar sesión. Sin contraseña — y funciona en cualquier dispositivo o navegador, incluso si es distinto de donde pediste este enlace.",
    signInButton: "Iniciar sesión en Coordination Board",
    signInFooter: "Si no pediste esto, puedes ignorar este correo.",
    inviteSubject: "Te invitaron a {org} en Coordination Board",
    inviteHeading: "Eres parte del equipo en {org}",
    inviteBody:
      "Toca abajo para entrar a tu tablero de trabajos. Sin contraseña, sin configuración — abre directo a los trabajos asignados a ti.",
    inviteButton: "Iniciar sesión en Coordination Board",
    inviteFooter: "Si no esperabas esto, puedes ignorar este correo.",
  },

  authConfirm: {
    title: "Termina de iniciar sesión",
    heading: "Casi listo",
    body: "Toca abajo para terminar de iniciar sesión en Coordination Board.",
    button: "Iniciar sesión",
    missing: "El enlace de acceso faltaba o no es válido.",
    verifyFailed:
      "No se pudo verificar el enlace de acceso — solicita uno nuevo.",
    sameBrowser:
      "No se pudo completar el inicio de sesión — abre el enlace en el mismo navegador donde lo solicitaste.",
  },

  admin: {
    back: "← Tablero",
    accounts: "Cuentas ({n})",
    trial14: "Prueba +14d",
    comp: "Cortesía (activa)",
    endTrial: "Terminar prueba",
    cancel: "Cancelar",
    delete: "Eliminar",
    deleteConfirm:
      "¿Eliminar permanentemente a {who} y TODOS sus trabajos? Esto no se puede deshacer.",
    salesmanName: "Nombre del vendedor",
    salesmanEmail: "vendedor@correo.com",
    addSalesman: "Agregar vendedor",
    ownerList: "Lista de dueños ({n})",
    ownerListDesc:
      "Dueños de negocio aprobados. Un correo aquí puede iniciar sesión, obtiene su propia empresa y puede invitar a sus propios vendedores. Los vendedores son invitados por su dueño — no se agregan aquí.",
    remove: "Eliminar",
    ownerEmailPlaceholder: "dueño@empresa.com",
    add: "Agregar",
    daysLeft: "· {d}d restantes",
  },

  misc: {
    companyNameAria: "Nombre de tu empresa",
    metaDescription:
      "Un tablero de estado compartido por trabajo. Cada oficio toca Hecho / En progreso / Bloqueado, y el dueño ve lo único que detiene la siguiente fase.",
  },

  pwa: {
    installLead: "Instalar: toca",
    installMid: "Compartir, luego",
    addToHomeScreen: "Agregar a la pantalla de inicio",
    dismiss: "Descartar",
  },

  health: {
    heading: "Estado",
    scaffold: "Coordination Board — andamiaje M0",
    allOk:
      "La app está funcionando y todas las variables de entorno están presentes.",
    someMissing:
      "La app está funcionando, pero faltan algunas variables de entorno. Copia .env.local.example a .env.local y complétalas.",
    present: "presente",
    missing: "faltante",
  },
};

export const dictionaries: Record<Lang, Dict> = { en, es };

/** Cookie holding the manual language override. Shared here (not in the
 *  server-only module) so the client LangToggle can read it. */
export const LANG_COOKIE = "lang";
