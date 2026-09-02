import { AnimatePresence, motion } from "framer-motion";
import { Link } from "react-router-dom";
import { useEffect, useState, type ReactNode } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import { cn } from "../lib/format";
import { Button, Field, Input, useToast } from "../components/ui";

/**
 * A section that flips between a read view and an edit form.
 *
 * The profile is read-first on purpose: most visits are to check a detail, not
 * change one, and permanently-open inputs invite accidental edits.
 */
function EditableSection({
  title,
  description,
  editing,
  onEdit,
  onCancel,
  children,
  view,
}: {
  title: string;
  description?: string;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  children: ReactNode;
  view: ReactNode;
}) {
  return (
    <div className="border-b border-white/6 py-5 last:border-0 last:pb-0 first:pt-0">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h4 className="text-[14px] font-semibold text-ink">{title}</h4>
          {description && (
            <p className="mt-1 max-w-prose text-[12.5px] leading-relaxed text-ink-3">
              {description}
            </p>
          )}
        </div>
        <Button size="sm" variant={editing ? "ghost" : "outline"} onClick={editing ? onCancel : onEdit}>
          {editing ? "Cancel" : "Edit"}
        </Button>
      </div>

      <AnimatePresence mode="wait" initial={false}>
        {editing ? (
          <motion.div
            key="edit"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        ) : (
          <motion.div
            key="view"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            className="pt-3"
          >
            {view}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ErrorNote({ children }: { children: ReactNode }) {
  return (
    <p className="mt-3 rounded-xl border border-[color:var(--color-failed)]/30 bg-[color:var(--color-failed)]/8 px-3.5 py-2.5 text-[13px] leading-relaxed text-ink-2">
      {children}
    </p>
  );
}

const ReadValue = ({ value, empty }: { value?: string | null; empty: string }) =>
  value ? (
    <p className="text-[14px] text-ink">{value}</p>
  ) : (
    <p className="text-[14px] text-ink-3">{empty}</p>
  );

type Section = "name" | "phone" | "contact" | "email" | "password" | null;

/**
 * Everything the signed-in member can change about their own account.
 *
 * Split into three write paths matching the backend, rather than one big form:
 * name and emergency contact are low-stakes, while email and password each demand
 * the current password because they change the credentials themselves. Bundling
 * them would mean asking for a password just to fix a typo in a name.
 */
export function AccountSettings() {
  const { user, patchUser, refreshUser } = useAuth();
  const toast = useToast();

  const [open, setOpen] = useState<Section>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [contact, setContact] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [emailPassword, setEmailPassword] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // Reseed the relevant form each time a section opens, so a cancelled edit
  // never leaves a stale value behind.
  useEffect(() => {
    setError(null);
    if (!user) return;
    if (open === "name") setName(user.name);
    if (open === "contact") setContact(user.emergency_contact ?? "");
    if (open === "phone") setPhone(user.phone ?? "");
    if (open === "email") {
      setEmail(user.email);
      setEmailPassword("");
    }
    if (open === "password") {
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
  }, [open, user]);

  if (!user) return null;

  const close = () => {
    setOpen(null);
    setError(null);
  };

  const saveName = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.updateProfile({ name: name.trim() });
      patchUser({ name: res.user.name });
      toast("Name updated", "ok");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your name");
    } finally {
      setBusy(false);
    }
  };

  const saveContact = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.updateProfile({ emergency_contact: contact.trim() });
      patchUser({ emergency_contact: res.user.emergency_contact });
      toast(res.user.emergency_contact ? "Emergency contact updated" : "Emergency contact removed", "ok");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the contact");
    } finally {
      setBusy(false);
    }
  };

  const savePhone = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.updateProfile({ phone: phone.trim() });
      /* The whole user, not just the number: changing it clears
         phone_verified server-side, and patching only `phone` would leave the
         banner and the gate reading a stale "verified". */
      patchUser(res.user);
      toast("Number saved — confirm it with the code we send", "ok");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save your number");
    } finally {
      setBusy(false);
    }
  };

  const saveEmail = async () => {
    setError(null);
    setBusy(true);
    try {
      const res = await api.changeEmail({
        email: email.trim(),
        current_password: emailPassword,
      });
      patchUser({ email: res.user.email });
      toast(res.changed ? "Email updated — use it next time you sign in" : res.message, "ok");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your email");
    } finally {
      setBusy(false);
    }
  };

  const savePassword = async () => {
    setError(null);

    if (newPassword.length < 8) {
      setError("Use at least 8 characters for the new password.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Those two passwords don't match.");
      return;
    }

    setBusy(true);
    try {
      await api.changePassword({
        current_password: currentPassword,
        password: newPassword,
      });
      toast("Password changed", "ok");
      close();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not change your password");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {/* ── Name ─────────────────────────────────────── */}
      <EditableSection
        title="Name"
        description="Shown on the roster, results and anything you post."
        editing={open === "name"}
        onEdit={() => setOpen("name")}
        onCancel={close}
        view={<ReadValue value={user.name} empty="Not set" />}
      >
        <Field label="Full name" htmlFor="acct-name">
          <Input
            id="acct-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoComplete="name"
            maxLength={80}
            autoFocus
          />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button className="mt-4" loading={busy} onClick={saveName} disabled={!name.trim()}>
          Save name
        </Button>
      </EditableSection>

      {/* ── Mobile number ────────────────────────────── */}
      {/* Above the emergency contact deliberately: these two are the pair
          people confuse, and putting your own number first makes the second
          one's description read as the contrast it is. */}
      <EditableSection
        title="Mobile number"
        description="Yours. Used for your ticket and for race-day changes."
        editing={open === "phone"}
        onEdit={() => setOpen("phone")}
        onCancel={close}
        view={
          <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
            <ReadValue value={user.phone} empty="Not set yet" />
            {user.phone &&
              (user.phone_verified ? (
                <span className="text-[12px] font-semibold text-[color:var(--color-paid)]">
                  Confirmed
                </span>
              ) : (
                /* An unconfirmed number is shown as such rather than hidden:
                   the column can hold one nobody has proved, and an organiser
                   reading it needs to know that. */
                <Link
                  to="/verify"
                  className="text-[12px] font-semibold text-gold underline decoration-gold/40 underline-offset-4 hover:decoration-gold"
                >
                  Not confirmed — confirm it
                </Link>
              ))}
          </div>
        }
      >
        <Field
          label="Mobile number"
          htmlFor="acct-phone"
          hint="Changing it means confirming the new one on WhatsApp."
        >
          <Input
            id="acct-phone"
            type="tel"
            inputMode="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="98765 43210"
            autoComplete="tel"
            autoFocus
          />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button className="mt-4" loading={busy} onClick={savePhone} disabled={!phone.trim()}>
          Save number
        </Button>
      </EditableSection>

      {/* ── Emergency contact ────────────────────────── */}
      <EditableSection
        title="Emergency contact"
        description="Somebody else's number, for if something happens on a run."
        editing={open === "contact"}
        onEdit={() => setOpen("contact")}
        onCancel={close}
        view={<ReadValue value={user.emergency_contact} empty="Not set yet" />}
      >
        <Field
          label="Contact number"
          htmlFor="acct-contact"
          hint="Leave it empty to remove it."
        >
          <Input
            id="acct-contact"
            value={contact}
            onChange={(e) => setContact(e.target.value)}
            placeholder="+91 99999 88888"
            autoComplete="tel"
            autoFocus
          />
        </Field>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button className="mt-4" loading={busy} onClick={saveContact}>
          {contact.trim() ? "Save contact" : "Remove contact"}
        </Button>
      </EditableSection>

      {/* ── Email ────────────────────────────────────── */}
      <EditableSection
        title="Email"
        description="This is how you sign in, so changing it needs your password."
        editing={open === "email"}
        onEdit={() => setOpen("email")}
        onCancel={close}
        view={<ReadValue value={user.email} empty="Not set" />}
      >
        <div className="space-y-4">
          <Field label="New email" htmlFor="acct-email">
            <Input
              id="acct-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              autoFocus
            />
          </Field>
          <Field
            label="Confirm with your password"
            htmlFor="acct-email-pw"
            hint="So a borrowed session can't take over the account."
          >
            <Input
              id="acct-email-pw"
              type="password"
              value={emailPassword}
              onChange={(e) => setEmailPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
            />
          </Field>
        </div>
        {error && <ErrorNote>{error}</ErrorNote>}
        <Button
          className="mt-4"
          loading={busy}
          onClick={saveEmail}
          disabled={!email.trim() || !emailPassword}
        >
          Change email
        </Button>
      </EditableSection>

      {/* ── Password ─────────────────────────────────── */}
      <EditableSection
        title="Password"
        description="Change it here without the emailed reset link."
        editing={open === "password"}
        onEdit={() => setOpen("password")}
        onCancel={close}
        view={<p className="text-[14px] text-ink-3">••••••••</p>}
      >
        <div className="space-y-4">
          <Field label="Current password" htmlFor="acct-pw-current">
            <Input
              id="acct-pw-current"
              type="password"
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              autoFocus
            />
          </Field>
          <Field label="New password" htmlFor="acct-pw-new" hint="At least 8 characters.">
            <Input
              id="acct-pw-new"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
          <Field label="Confirm new password" htmlFor="acct-pw-confirm">
            <Input
              id="acct-pw-confirm"
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              autoComplete="new-password"
              placeholder="••••••••"
            />
          </Field>
        </div>

        {/* Set honestly: tokens are stateless, so other sessions survive. */}
        <p className="mt-3 text-[11.5px] leading-relaxed text-ink-3">
          Any unused reset links stop working. Sessions already signed in elsewhere
          stay valid until they expire.
        </p>

        {error && <ErrorNote>{error}</ErrorNote>}
        <Button
          className="mt-4"
          loading={busy}
          onClick={savePassword}
          disabled={!currentPassword || !newPassword || !confirmPassword}
        >
          Change password
        </Button>
      </EditableSection>

      <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/6 pt-4">
        <p className={cn("text-[11.5px] leading-relaxed text-ink-3")}>
          Your role is set by an organiser and can't be changed here.
        </p>
        <Button size="sm" variant="ghost" onClick={() => void refreshUser()}>
          Refresh
        </Button>
      </div>
    </>
  );
}
