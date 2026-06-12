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

type NativeContactsResult =
  | { status: "ready"; totalContacts: number }
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

export async function readNativeContactsForImport(): Promise<NativeContactsResult> {
  if (typeof window === "undefined" || !Capacitor.isNativePlatform()) {
    return {
      status: "unsupported",
      message:
        "Contact import is available in the CREATOR mobile app. You can still invite someone by email.",
    };
  }

  if (!Capacitor.isPluginAvailable("Contacts")) {
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

  return { status: "ready", totalContacts };
}
