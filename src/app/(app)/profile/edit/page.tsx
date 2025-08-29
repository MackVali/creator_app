"use client";

import React, {
  useState,
  useEffect,
  useMemo,
  useRef,
} from "react";

type Profile = {
  name: string;
  handle: string;
  bio: string;
  location: string;
  website: string;
  pronouns: string;
  themeColor: string;
  publicProfile: boolean;
  avatarUrl: string;
  coverUrl: string;
};

type SocialLink = { label: string; url: string };

const initialProfile: Profile = {
  name: "Jane Doe",
  handle: "@janedoe",
  bio: "Designing a better web one pixel at a time.",
  location: "Earth",
  website: "example.com",
  pronouns: "she/her",
  themeColor: "#3b82f6",
  publicProfile: true,
  avatarUrl: "",
  coverUrl: "",
};

export default function EditProfilePage() {
  const [form, setForm] = useState<Profile>(initialProfile);
  const [avatar, setAvatar] = useState<string | null>(initialProfile.avatarUrl);
  const [cover, setCover] = useState<string | null>(initialProfile.coverUrl);
  const [zoom, setZoom] = useState(1);
  const [offsetY, setOffsetY] = useState(0);
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [websiteHint, setWebsiteHint] = useState("");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState(false);
  const [loading, setLoading] = useState(true);
  const saveButtonRef = useRef<HTMLButtonElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const handleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const current = JSON.stringify({
      ...form,
      avatar,
      cover,
      socialLinks,
      zoom,
      offsetY,
    });
    const initial = JSON.stringify({
      ...initialProfile,
      avatar: initialProfile.avatarUrl,
      cover: initialProfile.coverUrl,
      socialLinks: [],
      zoom: 1,
      offsetY: 0,
    });
    setDirty(current !== initial);
  }, [form, avatar, cover, socialLinks, zoom, offsetY]);

  const handleFile = (setter: (url: string) => void) => (
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (ev) => setter(ev.target?.result as string);
      reader.readAsDataURL(file);
    }
  };

  const handleChange = (field: keyof Profile, value: string | boolean) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleHandleChange = (value: string) => {
    let v = value.toLowerCase();
    if (!v.startsWith("@")) v = "@" + v.replace(/^@+/, "");
    handleChange("handle", v);
  };

  const handleWebsiteBlur = () => {
    if (form.website && !/^https?:\/\//i.test(form.website)) {
      setWebsiteHint(`https://${form.website}`);
    } else {
      setWebsiteHint("");
    }
  };

  const addSocialLink = () =>
    setSocialLinks([...socialLinks, { label: "", url: "" }]);
  const updateSocialLink = (
    i: number,
    field: keyof SocialLink,
    value: string
  ) => {
    setSocialLinks((links) =>
      links.map((l, idx) => (idx === i ? { ...l, [field]: value } : l))
    );
  };
  const removeSocialLink = (i: number) => {
    setSocialLinks((links) => links.filter((_, idx) => idx !== i));
  };

  const handleValid = /^@[a-z0-9_]{3,20}$/.test(form.handle);
  const handleError = form.handle && !handleValid
    ? "Must start with @ and be 3-20 lowercase letters, numbers, or _"
    : "";
  const canSave = dirty && handleValid && form.name.trim().length > 0;

  const reset = () => {
    setForm(initialProfile);
    setAvatar(initialProfile.avatarUrl);
    setCover(initialProfile.coverUrl);
    setZoom(1);
    setOffsetY(0);
    setSocialLinks([]);
    setWebsiteHint("");
  };

  const save = () => {
    if (!canSave) {
      handleRef.current?.focus();
      return;
    }
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setToast(true);
      setTimeout(() => setToast(false), 2000);
      saveButtonRef.current?.focus();
    }, 600);
  };

  const coverStyle = useMemo(
    () => ({ transform: `scale(${zoom}) translateY(${offsetY}px)` }),
    [zoom, offsetY]
  );

  if (loading) {
    return <LoadingSkeleton />;
  }

  return (
    <div className="min-h-screen bg-gray-900 text-gray-100">
      <StickyHeader
        onSave={save}
        canSave={canSave}
        saving={saving}
        saveRef={saveButtonRef}
      />
      <main className="pb-28">
        <ProfilePreviewCard
          profile={form}
          avatar={avatar}
          cover={cover}
          coverStyle={coverStyle}
        />
        <div className="space-y-8 p-4">
          <PhotosSection
            avatar={avatar}
            cover={cover}
            onAvatarChange={handleFile(setAvatar)}
            onCoverChange={handleFile(setCover)}
            zoom={zoom}
            setZoom={setZoom}
            offsetY={offsetY}
            setOffsetY={setOffsetY}
          />
          <BasicsSection
            form={form}
            handleHandleChange={handleHandleChange}
            handleChange={handleChange}
            handleError={handleError}
            nameRef={nameRef}
            handleRef={handleRef}
          />
          <DetailsSection
            form={form}
            handleChange={handleChange}
            onWebsiteBlur={handleWebsiteBlur}
            websiteHint={websiteHint}
          />
          <SocialLinksSection
            links={socialLinks}
            add={addSocialLink}
            update={updateSocialLink}
            remove={removeSocialLink}
          />
          <PreferencesSection
            form={form}
            handleChange={handleChange}
          />
        </div>
      </main>
      <StickyActionBar
        onReset={reset}
        onSave={save}
        canSave={canSave}
        saving={saving}
      />
      {toast && <Toast message="Profile saved" />}
    </div>
  );
}

function StickyHeader({
  onSave,
  canSave,
  saving,
  saveRef,
}: {
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
  saveRef: React.RefObject<HTMLButtonElement>;
}) {
  return (
    <header className="sticky top-0 z-10 flex items-center justify-between bg-gray-900/80 backdrop-blur border-b border-gray-700 px-4 py-2">
      <button
        onClick={() => window.history.back()}
        aria-label="Back"
        className="p-2 active:scale-95"
      >
        ←
      </button>
      <h1 className="text-sm font-semibold">Edit Profile</h1>
      <button
        ref={saveRef}
        onClick={onSave}
        disabled={!canSave || saving}
        className="text-blue-400 disabled:opacity-50 active:scale-95"
      >
        {saving ? "..." : "Save"}
      </button>
    </header>
  );
}

function ProfilePreviewCard({
  profile,
  avatar,
  cover,
  coverStyle,
}: {
  profile: Profile;
  avatar: string | null;
  cover: string | null;
  coverStyle: React.CSSProperties;
}) {
  return (
    <section className="p-4">
      <div className="overflow-hidden rounded-lg border border-gray-700">
        <div className="relative h-32 w-full bg-gray-800">
          {cover && (
            <img
              src={cover}
              alt=""
              className="absolute inset-0 h-full w-full object-cover"
              style={coverStyle}
            />
          )}
        </div>
        <div className="p-4 pt-0">
          <div className="relative -mt-12 mb-2 h-24 w-24">
            {avatar ? (
              <img
                src={avatar}
                alt=""
                className="h-24 w-24 rounded-full object-cover border-4 border-gray-900"
              />
            ) : (
              <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gray-700 border-4 border-gray-900 text-3xl">
                🙂
              </div>
            )}
          </div>
          <h2 className="font-semibold">{profile.name}</h2>
          <p className="text-sm" style={{ color: profile.themeColor }}>
            {profile.handle}
          </p>
          {profile.bio && <p className="mt-2 text-sm">{profile.bio}</p>}
          {profile.publicProfile ? (
            <span
              className="mt-2 inline-block rounded-full px-2 py-1 text-xs"
              style={{
                backgroundColor: profile.themeColor + "33",
                color: profile.themeColor,
              }}
            >
              Public
            </span>
          ) : (
            <span className="mt-2 inline-block rounded-full bg-gray-700 px-2 py-1 text-xs text-gray-300">
              Private
            </span>
          )}
        </div>
      </div>
    </section>
  );
}

function PhotosSection({
  avatar,
  cover,
  onAvatarChange,
  onCoverChange,
  zoom,
  setZoom,
  offsetY,
  setOffsetY,
}: {
  avatar: string | null;
  cover: string | null;
  onAvatarChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onCoverChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  zoom: number;
  setZoom: (n: number) => void;
  offsetY: number;
  setOffsetY: (n: number) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Photos</h3>
      <div className="relative w-full pb-[56.25%] overflow-hidden rounded-lg bg-gray-800">
        {cover && (
          <img
            src={cover}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
            style={{ transform: `scale(${zoom}) translateY(${offsetY}px)` }}
          />
        )}
        <label className="absolute inset-0 flex cursor-pointer items-center justify-center text-sm text-gray-300 bg-gray-900/50 hover:bg-gray-900/60 transition">
          <span>Change Cover</span>
          <input
            type="file"
            accept="image/*"
            onChange={onCoverChange}
            className="hidden"
          />
        </label>
      </div>
      <div className="flex items-center space-x-4">
        <div className="relative h-24 w-24 overflow-hidden rounded-full">
          {avatar ? (
            <img
              src={avatar}
              alt=""
              className="h-full w-full object-cover"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center bg-gray-700 text-3xl">
              🙂
            </div>
          )}
          <label className="absolute inset-0 flex cursor-pointer items-center justify-center text-sm text-gray-300 bg-gray-900/50 hover:bg-gray-900/60 transition">
            <span>Change</span>
            <input
              type="file"
              accept="image/*"
              onChange={onAvatarChange}
              className="hidden"
            />
          </label>
        </div>
      </div>
      <div className="space-y-2">
        <label className="flex items-center justify-between text-sm">
          <span>Zoom</span>
          <input
            type="range"
            min="0.8"
            max="1.4"
            step="0.01"
            value={zoom}
            onChange={(e) => setZoom(parseFloat(e.target.value))}
            className="ml-4 w-full"
          />
        </label>
        <label className="flex items-center justify-between text-sm">
          <span>Vertical offset</span>
          <input
            type="range"
            min="-40"
            max="40"
            step="1"
            value={offsetY}
            onChange={(e) => setOffsetY(parseFloat(e.target.value))}
            className="ml-4 w-full"
          />
        </label>
      </div>
    </section>
  );
}


function BasicsSection({
  form,
  handleHandleChange,
  handleChange,
  handleError,
  nameRef,
  handleRef,
}: {
  form: Profile;
  handleHandleChange: (value: string) => void;
  handleChange: (field: keyof Profile, value: string) => void;
  handleError: string;
  nameRef: React.RefObject<HTMLInputElement>;
  handleRef: React.RefObject<HTMLInputElement>;
}) {
  const bioRemaining = 160 - form.bio.length;
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Basics</h3>
      <div className="space-y-2">
        <label htmlFor="name" className="text-sm">
          Display Name <span className="text-red-500">*</span>
        </label>
        <input
          id="name"
          ref={nameRef}
          type="text"
          value={form.name}
          onChange={(e) => handleChange("name", e.target.value)}
          className="w-full rounded bg-gray-800 p-2 text-sm"
          required
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="handle" className="text-sm">
          Handle <span className="text-red-500">*</span>
        </label>
        <input
          id="handle"
          ref={handleRef}
          type="text"
          value={form.handle}
          onChange={(e) => handleHandleChange(e.target.value)}
          className="w-full rounded bg-gray-800 p-2 text-sm"
          aria-invalid={!!handleError}
          aria-describedby="handle-hint handle-error"
        />
        <p id="handle-hint" className="text-xs text-gray-400">
          Starts with @, 3–20 lowercase letters, numbers, or _
        </p>
        {handleError && (
          <p id="handle-error" className="text-xs text-red-500">
            {handleError}
          </p>
        )}
      </div>
      <div className="space-y-1">
        <label htmlFor="bio" className="text-sm">
          Bio
        </label>
        <textarea
          id="bio"
          value={form.bio}
          onChange={(e) => handleChange("bio", e.target.value)}
          className="w-full rounded bg-gray-800 p-2 text-sm"
          rows={3}
          maxLength={160}
        />
        <p className="text-xs text-gray-400">{bioRemaining} characters left</p>
      </div>
    </section>
  );
}

function DetailsSection({
  form,
  handleChange,
  onWebsiteBlur,
  websiteHint,
}: {
  form: Profile;
  handleChange: (field: keyof Profile, value: string) => void;
  onWebsiteBlur: () => void;
  websiteHint: string;
}) {
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Details (optional)</h3>
      <div className="space-y-2">
        <label htmlFor="location" className="text-sm">
          Location
        </label>
        <input
          id="location"
          type="text"
          value={form.location}
          onChange={(e) => handleChange("location", e.target.value)}
          className="w-full rounded bg-gray-800 p-2 text-sm"
        />
      </div>
      <div className="space-y-1">
        <label htmlFor="website" className="text-sm">
          Website
        </label>
        <input
          id="website"
          type="text"
          value={form.website}
          onChange={(e) => handleChange("website", e.target.value)}
          onBlur={onWebsiteBlur}
          className="w-full rounded bg-gray-800 p-2 text-sm"
          aria-describedby={websiteHint ? "website-hint" : undefined}
        />
        {websiteHint && (
          <p id="website-hint" className="text-xs text-gray-400">
            Will preview as {websiteHint}
          </p>
        )}
      </div>
      <div className="space-y-2">
        <label htmlFor="pronouns" className="text-sm">
          Pronouns
        </label>
        <select
          id="pronouns"
          value={form.pronouns}
          onChange={(e) => handleChange("pronouns", e.target.value)}
          className="w-full rounded bg-gray-800 p-2 text-sm"
        >
          <option value="">--</option>
          <option value="she/her">she/her</option>
          <option value="he/him">he/him</option>
          <option value="they/them">they/them</option>
          <option value="any">any</option>
        </select>
      </div>
    </section>
  );
}

function SocialLinksSection({
  links,
  add,
  update,
  remove,
}: {
  links: SocialLink[];
  add: () => void;
  update: (i: number, field: keyof SocialLink, value: string) => void;
  remove: (i: number) => void;
}) {
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Social Links (optional)</h3>
      <div className="space-y-3">
        {links.map((link, i) => (
          <div key={i} className="flex space-x-2">
            <input
              type="text"
              placeholder="Label"
              value={link.label}
              onChange={(e) => update(i, "label", e.target.value)}
              className="w-1/3 rounded bg-gray-800 p-2 text-sm"
            />
            <input
              type="text"
              placeholder="URL"
              value={link.url}
              onChange={(e) => update(i, "url", e.target.value)}
              className="w-2/3 rounded bg-gray-800 p-2 text-sm"
            />
            <button
              onClick={() => remove(i)}
              aria-label="Remove"
              className="p-2 text-red-400 active:scale-95"
            >
              ✕
            </button>
          </div>
        ))}
        <button
          onClick={add}
          className="flex items-center text-sm text-blue-400 active:scale-95"
        >
          ➕ Add Link
        </button>
      </div>
    </section>
  );
}

function PreferencesSection({
  form,
  handleChange,
}: {
  form: Profile;
  handleChange: (field: keyof Profile, value: string | boolean) => void;
}) {
  const colors = [
    "#3b82f6",
    "#10b981",
    "#ef4444",
    "#f59e0b",
    "#8b5cf6",
    "#ec4899",
  ];
  return (
    <section className="space-y-4">
      <h3 className="font-semibold">Preferences</h3>
      <div className="space-y-2">
        <p className="text-sm">Theme color</p>
        <div className="flex space-x-2">
          {colors.map((c) => (
            <button
              key={c}
              onClick={() => handleChange("themeColor", c)}
              className="h-8 w-8 rounded-full active:scale-95 focus:outline-none"
              style={{
                backgroundColor: c,
                border: form.themeColor === c ? "2px solid white" : "2px solid transparent",
              }}
              aria-label={`Set theme color ${c}`}
            />
          ))}
        </div>
      </div>
      <label className="flex items-center space-x-2 text-sm">
        <input
          type="checkbox"
          checked={form.publicProfile}
          onChange={(e) => handleChange("publicProfile", e.target.checked)}
          className="h-5 w-5"
        />
        <span>Public profile</span>
      </label>
    </section>
  );
}

function StickyActionBar({
  onReset,
  onSave,
  canSave,
  saving,
}: {
  onReset: () => void;
  onSave: () => void;
  canSave: boolean;
  saving: boolean;
}) {
  return (
    <div className="fixed bottom-0 left-0 right-0 z-10 flex justify-between bg-gray-900/80 backdrop-blur px-4 py-2 border-t border-gray-700">
      <button
        onClick={onReset}
        className="px-4 py-2 text-sm text-gray-300 active:scale-95"
      >
        Reset
      </button>
      <button
        onClick={onSave}
        disabled={!canSave || saving}
        className="px-4 py-2 text-sm bg-blue-600 text-white rounded disabled:opacity-50 active:scale-95"
      >
        {saving ? "Saving..." : "Save Changes"}
      </button>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="min-h-screen bg-gray-900 p-4 space-y-6 animate-pulse">
      <div className="h-10 rounded bg-gray-800" />
      <div className="h-48 rounded bg-gray-800" />
      <div className="h-96 rounded bg-gray-800" />
    </div>
  );
}

function Toast({ message }: { message: string }) {
  return (
    <div
      role="status"
      className="fixed bottom-16 left-1/2 -translate-x-1/2 rounded bg-gray-800 px-4 py-2 text-sm text-gray-100 shadow"
    >
      {message}
    </div>
  );
}

