/**
 * Auth views: sign in, sign up, magic-link confirmation, account.
 * Monolith aesthetic maintained.
 */

import {
  signInWithMagicLink,
  signInWithPassword,
  signOut,
  signUpWithPassword,
  getUser,
  getDisplayName,
} from "../supabase/auth";
import {
  acceptInvite,
  createInvite,
  getActivePartner,
  listPairings,
  revokePairing,
  type Pairing,
} from "../supabase/pairing";
import { deleteAccount, downloadExport, exportEverything } from "../supabase/account";
import { syncAllLocalToCloud } from "../supabase/sync";
import { hasSupabase } from "../supabase/client";
import { shellHtml } from "./views";

function shell(title: string, statusLabel: string, body: string): string {
  // Reuse the main shell so the sidebar + nav delegate + mobile topbar
  // all work. The previous custom shell in this file had no nav items,
  // which stranded users on the sign-in screen.
  return shellHtml({
    active: "account",
    title,
    seqId: "AUTH",
    statusLabel,
    body,
  });
}

export function renderAuthGate(container: HTMLElement, onAuthed: () => void): void {
  if (!hasSupabase()) {
    container.innerHTML = shell(
      "CLOUD_NOT_CONFIGURED",
      "LOCAL-ONLY MODE",
      `<section class="banner warn">
        <span class="pip"></span>
        <div class="body">
          <div class="label warn">NO BACKEND</div>
          <div style="color: var(--on-surface-variant); margin-top: 6px; font-family: var(--font-body); font-size: 0.9rem;">
            VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY are not set. The Cognitive Self-Tracking mode still works locally. Multi-mode features (Sampling Tracker, Reflection Library, Joint Notice, Mirror) require an account.
          </div>
          <div class="actions">
            <button class="btn" id="local-only-btn">CONTINUE LOCAL-ONLY</button>
          </div>
        </div>
      </section>
      <section class="module">
        <div class="label" style="margin-bottom: 10px;">SETUP</div>
        <p>See <code>tasks/accounts-deployment.md</code>. Create Supabase project, run <code>supabase/migrations/001_init.sql</code>, set <code>.env.local</code> from <code>.env.example</code>, restart dev server.</p>
      </section>`,
    );
    container
      .querySelector<HTMLButtonElement>("#local-only-btn")!
      .addEventListener("click", onAuthed);
    return;
  }

  renderSignIn(container, onAuthed);
}

function renderSignIn(container: HTMLElement, onAuthed: () => void): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">SIGN IN · PASSWORD</div>
      <label class="label" style="display: block; margin-bottom: 4px;">EMAIL</label>
      <input type="email" id="email" autocomplete="email" style="width: 100%; padding: 12px 14px; background: var(--surface-container-low); color: var(--on-surface); border: 0; border-bottom: 1px solid var(--outline-variant); font-family: var(--font-mono); font-size: 0.9rem; margin-bottom: 14px;" />
      <label class="label" style="display: block; margin-bottom: 4px;">PASSWORD</label>
      <input type="password" id="password" autocomplete="current-password" style="width: 100%; padding: 12px 14px; background: var(--surface-container-low); color: var(--on-surface); border: 0; border-bottom: 1px solid var(--outline-variant); font-family: var(--font-mono); font-size: 0.9rem; margin-bottom: 14px;" />
      <div id="err" class="label warn" style="display: none; margin-bottom: 10px;"></div>
      <div class="actions">
        <button class="btn" id="signin-btn">SIGN IN</button>
        <button class="btn ghost" id="magic-btn">MAGIC LINK</button>
        <button class="btn ghost" id="to-signup">CREATE ACCOUNT</button>
      </div>
      <div class="actions" style="margin-top: 14px;">
        <button class="btn ghost sm" data-nav="home">‹ RETURN TO HOME</button>
      </div>
    </section>`;
  container.innerHTML = shell("SIGN_IN", "AWAITING CREDENTIALS", body);

  const errEl = container.querySelector<HTMLElement>("#err")!;
  const emailEl = container.querySelector<HTMLInputElement>("#email")!;
  const passEl = container.querySelector<HTMLInputElement>("#password")!;
  function showErr(msg: string) {
    errEl.textContent = msg.toUpperCase();
    errEl.style.display = "block";
  }

  container.querySelector<HTMLButtonElement>("#signin-btn")!.addEventListener("click", async () => {
    errEl.style.display = "none";
    const r = await signInWithPassword(emailEl.value.trim(), passEl.value);
    if (!r.ok) return showErr(r.error);
    onAuthed();
  });
  container.querySelector<HTMLButtonElement>("#magic-btn")!.addEventListener("click", async () => {
    errEl.style.display = "none";
    const email = emailEl.value.trim();
    if (!email) return showErr("Email required.");
    const r = await signInWithMagicLink(email);
    if (!r.ok) return showErr(r.error);
    container.innerHTML = shell(
      "CHECK_EMAIL",
      "MAGIC LINK SENT",
      `<section class="module">
        <p>A sign-in link has been sent to <code>${email}</code>. Open it on this device.</p>
        <div class="actions"><button class="btn ghost" id="back">‹ BACK</button></div>
      </section>`,
    );
    container.querySelector<HTMLButtonElement>("#back")!.addEventListener("click", () =>
      renderSignIn(container, onAuthed),
    );
  });
  container.querySelector<HTMLButtonElement>("#to-signup")!.addEventListener("click", () =>
    renderSignUp(container, onAuthed),
  );
}

function renderSignUp(container: HTMLElement, onAuthed: () => void): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">CREATE ACCOUNT</div>
      <p>Data stored on your Supabase project (${location.host}'s backend). Encrypted at rest. Account deletion is final and purges all rows you own.</p>
      <label class="label" style="display: block; margin: 10px 0 4px;">DISPLAY NAME</label>
      <input type="text" id="name" style="width: 100%; padding: 12px 14px; background: var(--surface-container-low); color: var(--on-surface); border: 0; border-bottom: 1px solid var(--outline-variant); font-family: var(--font-mono); font-size: 0.9rem; margin-bottom: 14px;" />
      <label class="label" style="display: block; margin-bottom: 4px;">EMAIL</label>
      <input type="email" id="email" autocomplete="email" style="width: 100%; padding: 12px 14px; background: var(--surface-container-low); color: var(--on-surface); border: 0; border-bottom: 1px solid var(--outline-variant); font-family: var(--font-mono); font-size: 0.9rem; margin-bottom: 14px;" />
      <label class="label" style="display: block; margin-bottom: 4px;">PASSWORD (MIN 8)</label>
      <input type="password" id="password" autocomplete="new-password" style="width: 100%; padding: 12px 14px; background: var(--surface-container-low); color: var(--on-surface); border: 0; border-bottom: 1px solid var(--outline-variant); font-family: var(--font-mono); font-size: 0.9rem; margin-bottom: 14px;" />
      <div id="err" class="label warn" style="display: none; margin-bottom: 10px;"></div>
      <div class="actions">
        <button class="btn" id="signup-btn">CREATE</button>
        <button class="btn ghost" id="to-signin">‹ BACK</button>
        <button class="btn ghost sm" data-nav="home">‹ RETURN TO HOME</button>
      </div>
    </section>`;
  container.innerHTML = shell("CREATE_ACCOUNT", "AWAITING INPUT", body);

  const errEl = container.querySelector<HTMLElement>("#err")!;
  function showErr(msg: string) {
    errEl.textContent = msg.toUpperCase();
    errEl.style.display = "block";
  }

  container.querySelector<HTMLButtonElement>("#signup-btn")!.addEventListener("click", async () => {
    errEl.style.display = "none";
    const name = container.querySelector<HTMLInputElement>("#name")!.value.trim();
    const email = container.querySelector<HTMLInputElement>("#email")!.value.trim();
    const password = container.querySelector<HTMLInputElement>("#password")!.value;
    if (name.length < 1) return showErr("Display name required.");
    if (password.length < 8) return showErr("Password must be at least 8 characters.");
    const r = await signUpWithPassword(email, password, name);
    if (!r.ok) return showErr(r.error);
    container.innerHTML = shell(
      "CONFIRM_EMAIL",
      "VERIFICATION PENDING",
      `<section class="module">
        <p>Verification link sent to <code>${email}</code>. Open it on this device, then return here to sign in.</p>
        <div class="actions"><button class="btn" id="go-signin">GO TO SIGN IN</button></div>
      </section>`,
    );
    container
      .querySelector<HTMLButtonElement>("#go-signin")!
      .addEventListener("click", () => renderSignIn(container, onAuthed));
  });
  container
    .querySelector<HTMLButtonElement>("#to-signin")!
    .addEventListener("click", () => renderSignIn(container, onAuthed));
}

/* ---------- Account / settings / pairing ---------- */

export async function renderAccount(
  container: HTMLElement,
  onBack: () => void,
  onSignedOut: () => void,
): Promise<void> {
  const user = await getUser();
  if (!user) {
    onSignedOut();
    return;
  }
  const displayName = (await getDisplayName(user.id)) ?? "—";
  const pairings = await listPairings();
  const activePartner = await getActivePartner();
  const partnerName = activePartner ? (await getDisplayName(activePartner.partnerId)) ?? "—" : null;

  const body = `
    <section class="module">
      <div class="head">
        <div class="label">IDENTITY</div>
        <div class="label">USER_ID ${user.id.slice(0, 8).toUpperCase()}</div>
      </div>
      <div class="kv-list">
        <div class="kv"><span class="k">DISPLAY NAME</span><span class="v">${displayName}</span></div>
        <div class="kv"><span class="k">EMAIL</span><span class="v">${user.email ?? "—"}</span></div>
      </div>
    </section>

    <section class="module">
      <div class="head">
        <div class="label">PAIRING</div>
        <div class="label">${activePartner ? "ACTIVE" : "SOLO"}</div>
      </div>
      ${
        activePartner
          ? `<p>Paired with <b style="color: var(--on-surface);">${partnerName}</b>. Sharing is opt-in per item. Revoking severs shared visibility without deleting data.</p>
             <div class="actions">
               <button class="btn amber" id="revoke-btn">REVOKE PAIRING</button>
             </div>`
          : `<p>Two-person pair creates permission to share per-item. Default remains private.</p>
             <div class="actions">
               <button class="btn" id="invite-btn">GENERATE INVITE CODE</button>
               <button class="btn ghost" id="accept-btn">ENTER INVITE CODE</button>
             </div>`
      }

      <div id="pairing-history" style="margin-top: 18px;">
        ${
          pairings.length
            ? `<div class="label" style="margin-bottom: 8px;">LEDGER</div>
               <div class="stripe">${pairings
                 .map(
                   (p) =>
                     `<div class="trend-row"><span class="when">${new Date(p.created_at).toISOString().slice(0, 10)}</span><span>${p.status.toUpperCase()}${p.invite_code ? " · " + p.invite_code : ""}</span></div>`,
                 )
                 .join("")}</div>`
            : ""
        }
      </div>
    </section>

    <section class="module">
      <div class="head">
        <div class="label">COGNITIVE SYNC</div>
        <div class="label">LOCAL_FIRST</div>
      </div>
      <p>Mirrors local-first cognitive sessions into your account. Never called from inside a trial loop.</p>
      <div class="actions">
        <button class="btn ghost" id="sync-btn">SYNC LOCAL → CLOUD</button>
      </div>
      <div id="sync-result" class="label" style="margin-top: 10px;"></div>
    </section>

    <section class="module">
      <div class="head">
        <div class="label">DATA OPERATIONS</div>
      </div>
      <div style="display: flex; gap: 10px; flex-direction: column;">
        <button class="btn ghost" id="export-btn">EXPORT ALL (LOCAL + CLOUD)</button>
        <button class="btn ghost" id="signout-btn">SIGN OUT</button>
        <button class="btn amber" id="delete-btn">DELETE ACCOUNT + PURGE DATA</button>
      </div>
    </section>

    <div class="actions">
      <button class="btn ghost" id="back-btn">‹ RETURN</button>
    </div>
  `;

  container.innerHTML = shell("ACCOUNT", "SIGNED IN", body);

  container.querySelector<HTMLButtonElement>("#back-btn")!.addEventListener("click", onBack);
  container
    .querySelector<HTMLButtonElement>("#signout-btn")!
    .addEventListener("click", async () => {
      await signOut();
      onSignedOut();
    });
  container
    .querySelector<HTMLButtonElement>("#export-btn")!
    .addEventListener("click", async () => {
      const json = await exportEverything();
      downloadExport(json);
    });
  container
    .querySelector<HTMLButtonElement>("#delete-btn")!
    .addEventListener("click", async () => {
      if (
        !confirm(
          "Permanently delete this account and purge every row you own? This cannot be undone. Consider EXPORT first.",
        )
      )
        return;
      const r = await deleteAccount();
      if (!r.ok) alert("Delete failed: " + r.error);
      onSignedOut();
    });
  container
    .querySelector<HTMLButtonElement>("#sync-btn")!
    .addEventListener("click", async () => {
      const res = container.querySelector<HTMLElement>("#sync-result")!;
      res.textContent = "SYNCING…";
      const { synced, skipped } = await syncAllLocalToCloud();
      res.textContent = `SYNCED ${synced} · SKIPPED ${skipped}`;
    });

  if (activePartner) {
    container
      .querySelector<HTMLButtonElement>("#revoke-btn")!
      .addEventListener("click", async () => {
        if (!confirm("Revoke pairing? Shared visibility is severed immediately; no data is deleted on either side.")) return;
        await revokePairing(activePartner.pairingId);
        renderAccount(container, onBack, onSignedOut);
      });
  } else {
    container
      .querySelector<HTMLButtonElement>("#invite-btn")!
      .addEventListener("click", async () => {
        const r = await createInvite();
        if (!r.ok) return alert("Invite failed: " + r.error);
        renderInviteCreated(container, r.code, () => renderAccount(container, onBack, onSignedOut));
      });
    container
      .querySelector<HTMLButtonElement>("#accept-btn")!
      .addEventListener("click", () =>
        renderAcceptInvite(container, () => renderAccount(container, onBack, onSignedOut)),
      );
  }
}

function renderInviteCreated(
  container: HTMLElement,
  code: string,
  onBack: () => void,
): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">INVITE GENERATED</div>
      <p>Send this code to the person you want to pair with. It's single-use and expires when they accept. Only they can accept — you can't accept your own invite.</p>
      <div style="text-align: center; margin: 24px 0;">
        <div class="mono" style="font-size: 2.2rem; letter-spacing: 0.3em; color: var(--primary); padding: 22px; background: var(--surface-container-highest); border-top: 2px solid var(--primary);">${code}</div>
      </div>
      <div class="actions">
        <button class="btn ghost" id="copy-btn">COPY CODE</button>
        <button class="btn" id="done-btn">DONE</button>
      </div>
    </section>`;
  container.innerHTML = shell("PAIRING_INVITE", "AWAITING ACCEPTANCE", body);
  container.querySelector<HTMLButtonElement>("#copy-btn")!.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(code);
      const b = container.querySelector<HTMLButtonElement>("#copy-btn")!;
      b.textContent = "COPIED";
      setTimeout(() => (b.textContent = "COPY CODE"), 1500);
    } catch {
      alert("Copy failed — select manually.");
    }
  });
  container.querySelector<HTMLButtonElement>("#done-btn")!.addEventListener("click", onBack);
}

function renderAcceptInvite(container: HTMLElement, onBack: () => void): void {
  const body = `
    <section class="module">
      <div class="label" style="margin-bottom: 14px;">ACCEPT PAIRING INVITE</div>
      <p>Enter the code your partner generated.</p>
      <input type="text" id="code" autocomplete="off" style="width: 100%; padding: 14px; background: var(--surface-container-low); color: var(--primary); border: 0; border-bottom: 2px solid var(--primary); font-family: var(--font-mono); font-size: 1.1rem; letter-spacing: 0.2em; text-align: center; margin: 10px 0 14px; text-transform: uppercase;" placeholder="XXXX-XXXX" />
      <div id="err" class="label warn" style="display: none; margin-bottom: 10px;"></div>
      <div class="actions">
        <button class="btn" id="accept-btn">ACCEPT</button>
        <button class="btn ghost" id="cancel-btn">‹ BACK</button>
      </div>
    </section>`;
  container.innerHTML = shell("PAIRING_INVITE", "AWAITING CODE", body);
  const errEl = container.querySelector<HTMLElement>("#err")!;
  container.querySelector<HTMLButtonElement>("#accept-btn")!.addEventListener("click", async () => {
    errEl.style.display = "none";
    const code = container.querySelector<HTMLInputElement>("#code")!.value.trim().toUpperCase();
    if (!code) {
      errEl.textContent = "CODE REQUIRED.";
      errEl.style.display = "block";
      return;
    }
    const r = await acceptInvite(code);
    if (!r.ok) {
      errEl.textContent = r.error.toUpperCase();
      errEl.style.display = "block";
      return;
    }
    onBack();
  });
  container.querySelector<HTMLButtonElement>("#cancel-btn")!.addEventListener("click", onBack);
}

/** Only for completeness when needed by other modules. */
export async function listPairingsForDebug(): Promise<Pairing[]> {
  return listPairings();
}
