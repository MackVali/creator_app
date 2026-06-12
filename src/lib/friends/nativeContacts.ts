import {
  Capacitor,
  registerPlugin,
  type PermissionState,
} from "@capacitor/core";

type ContactsPermissionStatus = {
  contacts?: PermissionState;
  readContacts?: PermissionState;
};

type NativeContact = {
  name?: unknown;
  phones?: unknown[];
  emails?: unknown[];
};

type GetContactsResult = {
  contacts?: NativeContact[];
};

type NativeContactsPlugin = {
  checkPermissions?: () => Promise<ContactsPermissionStatus>;
  requestPermissions: () => Promise<ContactsPermissionStatus>;
  getContacts: (options?: {
    projection?: {
      name?: boolean;
      phones?: boolean;
      emails?: boolean;
    };
  }) => Promise<GetContactsResult>;
};

export type ContactImportIdentifier = {
  name: string | null;
  emails: string[];
  phones: string[];
};

type NativeContactsResult =
  | {
      status: "ready";
      totalContacts: number;
      contacts: ContactImportIdentifier[];
    }
  | { status: "empty"; message: string }
  | { status: "denied"; message: string }
  | { status: "unsupported"; message: string };

const Contacts = registerPlugin<NativeContactsPlugin>("Contacts");

function hasGrantedContactsPermission(status: ContactsPermissionStatus) {
  return status.contacts === "granted" || status.readContacts === "granted";
}

function hasDeniedContactsPermission(status: ContactsPermissionStatus) {
  return status.contacts === "denied" || status.readContacts === "denied";
}

function readString(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readContactName(value: unknown) {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!value || typeof value !== "object") {
    return null;
  }

  const record = value as Record<string, unknown>;
  const display = readString(record.display);
  if (display) {
    return display;
  }

  const parts = [
    readString(record.given),
    readString(record.middle),
    readString(record.family),
  ].filter(Boolean);

  return parts.length ? parts.join(" ") : null;
}

function readContactEmails(values: unknown[] | undefined) {
  const emails = new Set<string>();

  for (const value of values ?? []) {
    const raw =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? readString((value as Record<string, unknown>).address)
          : "";
    const normalized = raw.trim().toLowerCase();

    if (normalized.includes("@")) {
      emails.add(normalized);
    }
  }

  return Array.from(emails);
}

function readContactPhones(values: unknown[] | undefined) {
  const phones = new Set<string>();

  for (const value of values ?? []) {
    const raw =
      typeof value === "string"
        ? value
        : value && typeof value === "object"
          ? readString((value as Record<string, unknown>).number)
          : "";
    const normalized = raw.replace(/[^\d+]/g, "");

    if (normalized.replace(/\D/g, "").length >= 7) {
      phones.add(normalized);
    }
  }

  return Array.from(phones);
}

export async function readNativeContactsForImport(): Promise<NativeContactsResult> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return {
      status: "unsupported",
      message:
        "Contact import is available in the CREATOR mobile app. You can still invite someone by email.",
    };
  }

  if (!Capacitor.isPluginAvailable("Contacts")) {
    // Expected native bridge: a Contacts plugin compatible with @capacitor-community/contacts.
    return {
      status: "unsupported",
      message:
        "This version of the CREATOR app does not include contact importing yet. You can still invite someone by email.",
    };
  }

  const currentPermission = Contacts.checkPermissions
    ? await Contacts.checkPermissions()
    : null;

  const permission = currentPermission
    ? hasGrantedContactsPermission(currentPermission)
      ? currentPermission
      : await Contacts.requestPermissions()
    : await Contacts.requestPermissions();

  if (!hasGrantedContactsPermission(permission)) {
    return {
      status: "denied",
      message: hasDeniedContactsPermission(permission)
        ? "Allow Contacts access in Settings to invite people from your address book."
        : "Contacts permission is needed before CREATOR can import contacts.",
    };
  }

  const result = await Contacts.getContacts({
    projection: {
      name: true,
      phones: true,
      emails: true,
    },
  });

  const totalContacts = result.contacts?.length ?? 0;

  if (totalContacts === 0) {
    return {
      status: "empty",
      message: "No contacts were found on this device.",
    };
  }

  const contacts = (result.contacts ?? [])
    .map((contact) => ({
      name: readContactName(contact.name),
      emails: readContactEmails(contact.emails),
      phones: readContactPhones(contact.phones),
    }))
    .filter((contact) => contact.emails.length || contact.phones.length);

  if (contacts.length === 0) {
    return {
      status: "empty",
      message: "No contacts with email or phone details were found.",
    };
  }

  return { status: "ready", totalContacts, contacts };
}
