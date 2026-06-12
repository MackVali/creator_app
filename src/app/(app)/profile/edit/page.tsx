"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import * as Dialog from "@radix-ui/react-dialog";
import { Capacitor } from "@capacitor/core";
import { Camera as CapacitorCamera, CameraResultType, CameraSource } from "@capacitor/camera";
import type { CameraPermissionState, CameraPermissionType } from "@capacitor/camera";
import { useAuth } from "@/components/auth/AuthProvider";
import { useProfileContext } from "@/components/ProfileProvider";
import { getProfileByUserId, updateProfile } from "@/lib/db";
import { getSupabaseBrowser } from "@/lib/supabase";
import {
  deleteLinkedAccount,
  getLinkedAccounts,
  SupportedPlatform,
  upsertLinkedAccount,
} from "@/lib/db/linked-accounts";
import { deleteSocialLink, getSocialLinks } from "@/lib/db/profile-management";
import { updateMyOnboarding } from "@/lib/db/profiles-client";
import { Profile, ProfileFormData, SocialLink, LinkedAccount } from "@/lib/types";
import { uploadAvatar } from "@/lib/storage";
import { buildSocialUrl, normalizeUsername, resolveSocialLink } from "@/lib/profile/socialLinks";
import { getSocialIconDefinition } from "@/components/profile/SocialIcon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { ArrowLeft, Save, User, Calendar, MapPin, Images, Camera, Trash2, X } from "lucide-react";
import Link from "next/link";
import ContentCardManager from "@/components/profile/ContentCardManager";
import SocialPillsRow from "@/components/profile/SocialPillsRow";

type AvatarPhotoSource = "camera" | "photos";
type AvatarPermissionResult = "granted" | "limited" | "denied";

const LINKED_ACCOUNT_ORDER: SupportedPlatform[] = [
  "instagram",
  "tiktok",
  "youtube",
  "spotify",
  "snapchat",
  "facebook",
  "twitter",
];

const AVATAR_PHOTO_SOURCE_LABELS: Record<AvatarPhotoSource, string> = {
  camera: "Take Photo",
  photos: "Choose from Library",
};

function isCameraCancelError(error: unknown) {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";
  const normalized = message.toLowerCase();
  return normalized.includes("cancel") || normalized.includes("dismiss");
}

function getImageMimeType(format?: string) {
  const normalizedFormat = format?.toLowerCase();
  if (normalizedFormat === "png") {
    return "image/png";
  }
  if (normalizedFormat === "gif") {
    return "image/gif";
  }
  if (normalizedFormat === "webp") {
    return "image/webp";
  }
  return "image/jpeg";
}

function getImageFileExtension(format?: string) {
  const normalizedFormat = format?.toLowerCase();
  if (normalizedFormat === "png" || normalizedFormat === "gif" || normalizedFormat === "webp") {
    return normalizedFormat;
  }
  return "jpg";
}

function base64ToBlob(base64: string, mimeType: string) {
  const byteCharacters = window.atob(base64);
  const byteArrays: Uint8Array[] = [];

  for (let offset = 0; offset < byteCharacters.length; offset += 512) {
    const slice = byteCharacters.slice(offset, offset + 512);
    const byteNumbers = new Array(slice.length);

    for (let i = 0; i < slice.length; i += 1) {
      byteNumbers[i] = slice.charCodeAt(i);
    }

    byteArrays.push(new Uint8Array(byteNumbers));
  }

  return new Blob(byteArrays, { type: mimeType });
}

function isPromptableCameraPermission(permission: CameraPermissionState) {
  return permission === "prompt" || permission === "prompt-with-rationale";
}

export default function ProfileEditPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuth();
  const { refreshProfile } = useProfileContext();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [hasAttemptedSubmit, setHasAttemptedSubmit] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const [formData, setFormData] = useState<ProfileFormData>({
    name: "",
    username: "",
    dob: "",
    city: "",
    bio: "",
    is_private: false,
  });

  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [avatarMarkedForRemoval, setAvatarMarkedForRemoval] = useState(false);
  const [isAvatarSourceDialogOpen, setIsAvatarSourceDialogOpen] = useState(false);
  const [avatarSourceLoading, setAvatarSourceLoading] = useState<AvatarPhotoSource | null>(null);
  const [isWebCameraOpen, setIsWebCameraOpen] = useState(false);
  const [webCameraStarting, setWebCameraStarting] = useState(false);
  const [webCameraCapturing, setWebCameraCapturing] = useState(false);
  const [webCameraError, setWebCameraError] = useState<string | null>(null);
  const [webCameraStream, setWebCameraStream] = useState<MediaStream | null>(null);
  const [isAvatarEditorOpen, setIsAvatarEditorOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarSourceUrl, setPendingAvatarSourceUrl] = useState<string | null>(null);
  const [editorZoom, setEditorZoom] = useState(1);
  const [editorOffset, setEditorOffset] = useState({ x: 0, y: 0 });
  const [editorImageSize, setEditorImageSize] = useState({ width: 0, height: 0 });
  const [editorFrameSize, setEditorFrameSize] = useState({ width: 0, height: 0 });
  const avatarEditorFrameRef = useRef<HTMLDivElement | null>(null);
  const webCameraVideoRef = useRef<HTMLVideoElement | null>(null);
  const webCameraStreamRef = useRef<MediaStream | null>(null);
  const webCameraRequestIdRef = useRef(0);
  const webPhotoLibraryInputRef = useRef<HTMLInputElement | null>(null);
  const gestureStateRef = useRef<{
    mode: "pan" | "pinch";
    startDistance: number;
    startMidpoint: { x: number; y: number };
    startZoom: number;
    startOffset: { x: number; y: number };
  } | null>(null);
  const editorZoomRef = useRef(editorZoom);
  const editorOffsetRef = useRef(editorOffset);
  editorZoomRef.current = editorZoom;
  editorOffsetRef.current = editorOffset;
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [linkedAccounts, setLinkedAccounts] = useState<LinkedAccount[]>([]);
  const [inlineSelectedPlatform, setInlineSelectedPlatform] = useState<SupportedPlatform | null>(
    null,
  );
  const [isSocialPickerOpen, setIsSocialPickerOpen] = useState(false);
  const [inlineHandle, setInlineHandle] = useState("");
  const [inlineError, setInlineError] = useState<string | null>(null);
  const [inlineAction, setInlineAction] = useState<"save" | "remove" | null>(null);
  const inlineSaving = inlineAction !== null;
  const inlinePlatformDefinition = inlineSelectedPlatform
    ? getSocialIconDefinition(inlineSelectedPlatform)
    : null;
  const InlinePlatformIcon = inlinePlatformDefinition?.icon;

  const onboarding = searchParams.get("onboarding") === "1";
  const redirectPath = searchParams.get("redirect");

  useEffect(() => {
    async function loadProfile() {
      if (!user?.id) {
        router.push("/auth");
        return;
      }

      try {
        setLoading(true);
        const userProfile = await getProfileByUserId(user.id);
        
      if (userProfile) {
        setProfile(userProfile);
        setFormData({
          name: userProfile.name || "",
          username: userProfile.username || "",
          dob: userProfile.dob || "",
          city: userProfile.city || "",
          bio: userProfile.bio || "",
          is_private: userProfile.is_private ?? false,
        });
        setAvatarPreview(userProfile.avatar_url || null);
        setAvatarMarkedForRemoval(false);
      }
      } catch (err) {
        console.error("Error loading profile:", err);
        setError("Failed to load profile");
      } finally {
        setLoading(false);
      }
    }

    loadProfile();
  }, [user, router]);

  useEffect(() => {
    let isActive = true;

    if (!profile?.user_id) {
      setSocialLinks([]);
      return;
    }

    (async () => {
      try {
        const links = await getSocialLinks(profile.user_id);
        if (isActive) {
          const normalizedLinks = links.map((link) => {
            const usernameSource = link.username ?? link.url;
            const normalizedUsername = normalizeUsername(link.platform, usernameSource);
            const canonicalUrl = normalizedUsername
              ? buildSocialUrl(link.platform, normalizedUsername)
              : link.url;
            return {
              ...link,
              username: normalizedUsername || link.username,
              url: canonicalUrl ?? link.url,
            };
          });
          setSocialLinks(normalizedLinks);
        }
      } catch (err) {
        console.error("Error loading social links:", err);
        if (isActive) {
          setSocialLinks([]);
        }
      }
    })();

    return () => {
      isActive = false;
    };
  }, [profile?.user_id]);

  const refreshLinkedAccounts = useCallback(async () => {
    if (!profile?.user_id) {
      setLinkedAccounts([]);
      return;
    }

    try {
      const accounts = await getLinkedAccounts(profile.user_id);
      setLinkedAccounts(accounts);
    } catch (err) {
      console.error("Error loading linked accounts:", err);
      setLinkedAccounts([]);
    }
  }, [profile?.user_id]);

  useEffect(() => {
    refreshLinkedAccounts();
  }, [refreshLinkedAccounts]);

  const socialsData = useMemo(() => {
    const data: Record<string, string | undefined> = {};

    linkedAccounts.forEach((account) => {
      const platformKey = account.platform?.toLowerCase?.();
      if (!platformKey || !account.url) return;
      data[platformKey] = account.url;
    });

    socialLinks.forEach((link) => {
      const platformKey = link.platform.toLowerCase();
      if (data[platformKey]) return;

      const resolved = resolveSocialLink(link);
      if (resolved.url) {
        data[platformKey] = resolved.url;
      }
    });
    return data;
  }, [linkedAccounts, socialLinks]);

  const linkedHandlePrefills = useMemo(() => {
    const prefills: Record<string, string> = {};

    linkedAccounts.forEach((account) => {
      const platformKey = account.platform?.toLowerCase?.();
      if (!platformKey) return;
      const handle = normalizeUsername(platformKey, account.url);
      if (handle) {
        prefills[platformKey] = handle;
      }
    });

    socialLinks.forEach((link) => {
      const platformKey = link.platform?.toLowerCase?.();
      if (!platformKey || prefills[platformKey]) return;

      const resolved = resolveSocialLink(link);
      const handle = normalizeUsername(platformKey, link.username ?? resolved.url);
      if (handle) {
        prefills[platformKey] = handle;
      }
    });

    return prefills;
  }, [linkedAccounts, socialLinks]);

  const activeLinkedAccounts = useMemo(() => {
    const visible = linkedAccounts.filter((account) => account.url?.trim());
    const sortIndex = (platform?: string) => {
      const normalized = (platform ?? "").toLowerCase();
      const index = LINKED_ACCOUNT_ORDER.indexOf(normalized as SupportedPlatform);
      return index === -1 ? LINKED_ACCOUNT_ORDER.length : index;
    };

    return [...visible].sort((a, b) => {
      const indexA = sortIndex(a.platform);
      const indexB = sortIndex(b.platform);
      return indexA - indexB;
    });
  }, [linkedAccounts]);

  const hasLinkedAccounts = activeLinkedAccounts.length > 0;
  const inlineSelectedLinkedAccount = inlineSelectedPlatform
    ? linkedAccounts.find(
        (account) =>
          account.platform?.toLowerCase?.() === inlineSelectedPlatform &&
          account.url?.trim(),
      )
    : undefined;
  const inlineSelectedSocialLinks = inlineSelectedPlatform
    ? socialLinks.filter((link) => link.platform?.toLowerCase?.() === inlineSelectedPlatform)
    : [];
  const inlineCanRemove =
    Boolean(inlineSelectedLinkedAccount) || inlineSelectedSocialLinks.length > 0;

  const closeSocialEditor = useCallback(() => {
    setInlineSelectedPlatform(null);
    setInlineError(null);
    setInlineHandle("");
  }, []);

  const handlePlatformSelection = useCallback(
    (platform?: SupportedPlatform) => {
      if (!platform) {
        setIsAvatarSourceDialogOpen(false);
        setInlineError(null);
        setIsSocialPickerOpen(true);
        return;
      }
      setIsAvatarSourceDialogOpen(false);
      setIsSocialPickerOpen(false);
      setInlineSelectedPlatform(platform);
      setInlineHandle(linkedHandlePrefills[platform] ?? "");
      setInlineError(null);
    },
    [linkedHandlePrefills],
  );

  const handleInlineSave = useCallback(async () => {
    if (!user?.id || !inlineSelectedPlatform) {
      return;
    }

    const trimmed = inlineHandle.trim();
    if (!trimmed) {
      setInlineError("Enter a username or link");
      return;
    }

    setInlineAction("save");
    setInlineError(null);
    const { success, error: saveError } = await upsertLinkedAccount(
      user.id,
      inlineSelectedPlatform,
      trimmed,
    );
    setInlineAction(null);

    if (success) {
      closeSocialEditor();
      await refreshLinkedAccounts();
    } else {
      setInlineError(saveError || "Failed to link account");
    }
  }, [closeSocialEditor, inlineHandle, inlineSelectedPlatform, refreshLinkedAccounts, user?.id]);

  const handleInlineRemove = useCallback(async () => {
    if (!user?.id || !inlineSelectedPlatform) {
      return;
    }

    const linkedAccountExists = linkedAccounts.some(
      (account) =>
        account.platform?.toLowerCase?.() === inlineSelectedPlatform &&
        account.url?.trim(),
    );
    const matchingSocialLinks = socialLinks.filter(
      (link) => link.platform?.toLowerCase?.() === inlineSelectedPlatform,
    );

    if (!linkedAccountExists && matchingSocialLinks.length === 0) {
      closeSocialEditor();
      return;
    }

    setInlineAction("remove");
    setInlineError(null);

    const results = await Promise.all([
      ...(linkedAccountExists
        ? [deleteLinkedAccount(user.id, inlineSelectedPlatform)]
        : []),
      ...matchingSocialLinks.map((link) => deleteSocialLink(link.id, user.id)),
    ]);
    const failedResult = results.find((result) => !result.success);

    setInlineAction(null);

    if (failedResult) {
      setInlineError(failedResult.error || "Failed to remove link");
      return;
    }

    setSocialLinks((currentLinks) =>
      currentLinks.filter((link) => link.platform?.toLowerCase?.() !== inlineSelectedPlatform),
    );
    closeSocialEditor();
    await refreshLinkedAccounts();
  }, [
    closeSocialEditor,
    inlineSelectedPlatform,
    linkedAccounts,
    refreshLinkedAccounts,
    socialLinks,
    user?.id,
  ]);

  const handleInputChange = (field: keyof ProfileFormData, value: string) => {
    setFormData(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handlePrivacyChange = (checked: boolean) => {
    setFormData(prev => ({
      ...prev,
      is_private: checked
    }));
  };

  const validateRequired = () => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = "Name is required";
    }

    if (!formData.username.trim()) {
      errors.username = "Username is required";
    }

    if (!formData.dob.trim()) {
      errors.dob = "Date of birth is required";
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const MAX_EDITOR_ZOOM = 2.75;
  const AVATAR_EXPORT_SIZE = 1200;
  const EDITOR_CROP_GUIDE_SCALE = 0.78;
  const FALLBACK_EDITOR_SURFACE_SIZE = 320;

  type EditorSize = { width: number; height: number };

  const getTouchDistance = (a: React.Touch, b: React.Touch) => {
    const dx = b.clientX - a.clientX;
    const dy = b.clientY - a.clientY;
    return Math.sqrt(dx * dx + dy * dy);
  };

  const getTouchMidpoint = (a: React.Touch, b: React.Touch) => ({
    x: (a.clientX + b.clientX) / 2,
    y: (a.clientY + b.clientY) / 2,
  });

  const getEditorSurfaceSize = useCallback((frameSize: EditorSize = editorFrameSize) => {
    return Math.min(frameSize.width, frameSize.height) || FALLBACK_EDITOR_SURFACE_SIZE;
  }, [editorFrameSize]);

  const getEditorCropSize = useCallback(
    (frameSize: EditorSize = editorFrameSize) => {
      return getEditorSurfaceSize(frameSize) * EDITOR_CROP_GUIDE_SCALE;
    },
    [editorFrameSize, getEditorSurfaceSize],
  );

  const getEditorBaseCoverScale = useCallback(
    (imageSize: EditorSize = editorImageSize, frameSize: EditorSize = editorFrameSize) => {
      const cropSize = getEditorCropSize(frameSize);
      if (!imageSize.width || !imageSize.height || !cropSize) {
        return 1;
      }

      return Math.max(cropSize / imageSize.width, cropSize / imageSize.height);
    },
    [editorFrameSize, editorImageSize, getEditorCropSize],
  );

  const getEditorRenderState = useCallback(
    (
      zoomMultiplier: number,
      imageSize: EditorSize = editorImageSize,
      frameSize: EditorSize = editorFrameSize,
    ) => {
      const surfaceSize = getEditorSurfaceSize(frameSize);
      const cropSize = getEditorCropSize(frameSize);
      const baseCoverScale = getEditorBaseCoverScale(imageSize, frameSize);
      const clampedZoom = Math.min(MAX_EDITOR_ZOOM, Math.max(1, zoomMultiplier || 1));
      const renderedWidth = imageSize.width
        ? imageSize.width * baseCoverScale * clampedZoom
        : 1;
      const renderedHeight = imageSize.height
        ? imageSize.height * baseCoverScale * clampedZoom
        : 1;

      return {
        surfaceSize,
        cropSize,
        baseCoverScale,
        zoomMultiplier: clampedZoom,
        renderedWidth,
        renderedHeight,
      };
    },
    [editorFrameSize, editorImageSize, getEditorBaseCoverScale, getEditorCropSize, getEditorSurfaceSize],
  );

  const getEditorPointFromCenter = useCallback((point: { x: number; y: number }) => {
    const frame = avatarEditorFrameRef.current;
    if (!frame) {
      return { x: 0, y: 0 };
    }

    const rect = frame.getBoundingClientRect();
    return {
      x: point.x - (rect.left + rect.width / 2),
      y: point.y - (rect.top + rect.height / 2),
    };
  }, []);

  const getOffsetForZoom = useCallback(
    (
      offset: { x: number; y: number },
      currentZoom: number,
      nextZoom: number,
      focalPoint = { x: 0, y: 0 },
    ) => {
      const safeCurrentZoom = currentZoom || 1;
      const zoomRatio = nextZoom / safeCurrentZoom;

      return {
        x: focalPoint.x - (focalPoint.x - offset.x) * zoomRatio,
        y: focalPoint.y - (focalPoint.y - offset.y) * zoomRatio,
      };
    },
    [],
  );

  const clampEditorOffset = useCallback(
    (
      nextOffset: { x: number; y: number },
      zoomMultiplier: number,
      imageSize: EditorSize = editorImageSize,
      frameSize: EditorSize = editorFrameSize,
    ) => {
      const { cropSize, renderedWidth, renderedHeight } = getEditorRenderState(
        zoomMultiplier,
        imageSize,
        frameSize,
      );
      if (
        !imageSize.width ||
        !imageSize.height ||
        !cropSize
      ) {
        return nextOffset;
      }

      const maxOffsetX = Math.max(0, (renderedWidth - cropSize) / 2);
      const maxOffsetY = Math.max(0, (renderedHeight - cropSize) / 2);

      return {
        x: Math.min(maxOffsetX, Math.max(-maxOffsetX, nextOffset.x)),
        y: Math.min(maxOffsetY, Math.max(-maxOffsetY, nextOffset.y)),
      };
    },
    [editorFrameSize, editorImageSize, getEditorRenderState],
  );

  const openAvatarEditorFromFile = useCallback((file: File) => {
    try {
      if (!file.type.startsWith("image/")) {
        setError("Please choose an image file for your profile photo.");
        return false;
      }

      const sourceUrl = URL.createObjectURL(file);
      setPendingAvatarSourceUrl((currentSourceUrl) => {
        if (currentSourceUrl) {
          URL.revokeObjectURL(currentSourceUrl);
        }
        return sourceUrl;
      });
      setPendingAvatarFile(file);
      setEditorZoom(1);
      setEditorOffset({ x: 0, y: 0 });
      setEditorImageSize({ width: 0, height: 0 });
      setEditorFrameSize({ width: 0, height: 0 });
      setIsAvatarEditorOpen(true);
      setError(null);
      return true;
    } catch (err) {
      console.error("Error opening selected profile photo:", err);
      setError("We couldn't open that photo. Please try choosing another image.");
      return false;
    }
  }, []);

  const stopWebCameraStream = useCallback(() => {
    webCameraStreamRef.current?.getTracks().forEach((track) => {
      track.stop();
    });
    webCameraStreamRef.current = null;
    setWebCameraStream(null);

    if (webCameraVideoRef.current) {
      webCameraVideoRef.current.srcObject = null;
    }
  }, []);

  const ensureNativeAvatarPhotoPermission = useCallback(
    async (source: AvatarPhotoSource): Promise<AvatarPermissionResult> => {
      if (Capacitor.getPlatform() !== "ios") {
        return "granted";
      }

      const permission: CameraPermissionType = source === "camera" ? "camera" : "photos";
      const permissionLabel = source === "camera" ? "camera" : "photo library";
      const permissionMessage =
        source === "camera"
          ? "Camera access is needed to take a profile photo. Enable camera access in Settings and try again."
          : "Photo library access is needed to choose a profile photo. Enable photo access in Settings and try again.";

      try {
        let status = await CapacitorCamera.checkPermissions();
        let permissionState = status[permission];

        if (isPromptableCameraPermission(permissionState)) {
          status = await CapacitorCamera.requestPermissions({ permissions: [permission] });
          permissionState = status[permission];
        }

        if (permissionState === "granted") {
          return "granted";
        }

        if (source === "photos" && permissionState === "limited") {
          return "limited";
        }

        setError(permissionMessage);
        return "denied";
      } catch (permissionError) {
        console.error(`Error checking ${permissionLabel} permission:`, permissionError);
        setError(`We couldn't check ${permissionLabel} permission. Please try again.`);
        return "denied";
      }
    },
    [],
  );

  const handleCapacitorAvatarPhoto = async (source: AvatarPhotoSource) => {
    setAvatarSourceLoading(source);
    setError(null);
    setIsAvatarSourceDialogOpen(false);

    try {
      const permissionResult = await ensureNativeAvatarPhotoPermission(source);
      if (permissionResult === "denied") {
        return;
      }

      const photo = await CapacitorCamera.getPhoto({
        source: source === "camera" ? CameraSource.Camera : CameraSource.Photos,
        resultType: CameraResultType.Base64,
        quality: 85,
        correctOrientation: true,
        allowEditing: false,
      });

      if (!photo.base64String) {
        setError("We couldn't read that photo. Please try another image.");
        return;
      }

      const mimeType = getImageMimeType(photo.format);
      let blob: Blob;
      try {
        blob = base64ToBlob(photo.base64String, mimeType);
      } catch (conversionError) {
        console.error("Error converting profile photo result:", conversionError);
        setError("We couldn't process that photo. Please try another image.");
        return;
      }

      if (!blob.size) {
        setError("We couldn't read that photo. Please try another image.");
        return;
      }

      const extension = getImageFileExtension(photo.format);
      const file = new File([blob], `avatar-${source}-${Date.now()}.${extension}`, {
        type: mimeType,
      });

      openAvatarEditorFromFile(file);
    } catch (err) {
      if (isCameraCancelError(err)) {
        return;
      }

      console.error(`Error opening profile photo ${source}:`, err);
      setError(
        source === "camera"
          ? "We couldn't open the camera. Check camera permission and try again."
          : "We couldn't open your photo library. Check photo permission and try again.",
      );
    } finally {
      setAvatarSourceLoading(null);
    }
  };

  const handleWebAvatarCamera = async () => {
    const requestId = webCameraRequestIdRef.current + 1;
    webCameraRequestIdRef.current = requestId;

    setError(null);
    setWebCameraError(null);
    setIsAvatarSourceDialogOpen(false);
    setIsWebCameraOpen(true);
    setWebCameraStarting(true);
    setAvatarSourceLoading("camera");
    stopWebCameraStream();

    const mediaDevices = window.navigator?.mediaDevices;
    const getUserMedia = mediaDevices?.getUserMedia?.bind(mediaDevices);

    if (!getUserMedia) {
      setWebCameraError("Camera preview is not available in this browser. Choose from Library instead.");
      setWebCameraStarting(false);
      setAvatarSourceLoading(null);
      return;
    }

    let stream: MediaStream | null = null;
    try {
      stream = await getUserMedia({
        video: { facingMode: "user" },
        audio: false,
      });

      if (webCameraRequestIdRef.current !== requestId) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }

      webCameraStreamRef.current = stream;
      setWebCameraStream(stream);
    } catch (cameraError) {
      stream?.getTracks().forEach((track) => track.stop());

      if (webCameraRequestIdRef.current === requestId) {
        console.error("Error opening web profile camera:", cameraError);
        stopWebCameraStream();
        setWebCameraError("Camera preview is not available in this browser. Choose from Library instead.");
      }
    } finally {
      if (webCameraRequestIdRef.current === requestId) {
        setWebCameraStarting(false);
        setAvatarSourceLoading(null);
      }
    }
  };

  const handleWebAvatarLibrary = () => {
    webCameraRequestIdRef.current += 1;
    stopWebCameraStream();
    setError(null);
    setWebCameraError(null);
    setIsWebCameraOpen(false);
    setIsAvatarSourceDialogOpen(false);
    const input = webPhotoLibraryInputRef.current;
    if (!input) {
      setError("We couldn't open your photo library. Please try again.");
      return;
    }
    input.value = "";
    input.click();
  };

  const handleAvatarSourceSelect = (source: AvatarPhotoSource) => {
    if (Capacitor.isNativePlatform()) {
      void handleCapacitorAvatarPhoto(source);
      return;
    }

    if (source === "camera") {
      void handleWebAvatarCamera();
      return;
    }

    handleWebAvatarLibrary();
  };

  const handleWebLibraryFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";

    if (!file) {
      return;
    }

    openAvatarEditorFromFile(file);
  };

  const handleWebCameraCancel = useCallback(() => {
    webCameraRequestIdRef.current += 1;
    stopWebCameraStream();
    setIsWebCameraOpen(false);
    setWebCameraError(null);
    setWebCameraStarting(false);
    setWebCameraCapturing(false);
    setAvatarSourceLoading(null);
  }, [stopWebCameraStream]);

  const handleWebCameraCapture = useCallback(async () => {
    const video = webCameraVideoRef.current;
    if (!video || !webCameraStreamRef.current || !video.videoWidth || !video.videoHeight) {
      setWebCameraError("The camera preview isn't ready yet. Please try again.");
      return;
    }

    setWebCameraCapturing(true);
    setWebCameraError(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const context = canvas.getContext("2d");
      if (!context) {
        throw new Error("Canvas context unavailable");
      }

      context.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
      });

      if (!blob?.size) {
        throw new Error("Captured photo blob was empty");
      }

      const file = new File([blob], `avatar-camera-${Date.now()}.jpg`, {
        type: "image/jpeg",
      });

      stopWebCameraStream();
      setIsWebCameraOpen(false);
      openAvatarEditorFromFile(file);
    } catch (captureError) {
      console.error("Error capturing profile photo from web camera:", captureError);
      stopWebCameraStream();
      setIsWebCameraOpen(false);
      setError("We couldn't capture that photo. Please try again.");
    } finally {
      setWebCameraCapturing(false);
      setAvatarSourceLoading(null);
    }
  }, [openAvatarEditorFromFile, stopWebCameraStream]);

  const handleEditorTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    event.preventDefault();

    if (event.touches.length >= 2) {
      const [touchA, touchB] = [event.touches[0], event.touches[1]];
      const midpoint = getTouchMidpoint(touchA, touchB);
      gestureStateRef.current = {
        mode: "pinch",
        startDistance: getTouchDistance(touchA, touchB),
        startMidpoint: midpoint,
        startZoom: editorZoomRef.current,
        startOffset: { ...editorOffsetRef.current },
      };
      return;
    }

    if (event.touches.length === 1) {
      const touch = event.touches[0];
      gestureStateRef.current = {
        mode: "pan",
        startDistance: 0,
        startMidpoint: { x: touch.clientX, y: touch.clientY },
        startZoom: editorZoomRef.current,
        startOffset: { ...editorOffsetRef.current },
      };
    }
  };

  const handleEditorTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    if (!gestureStateRef.current) return;
    event.preventDefault();

    if (event.touches.length >= 2 && gestureStateRef.current.mode !== "pinch") {
      const [touchA, touchB] = [event.touches[0], event.touches[1]];
      const midpoint = getTouchMidpoint(touchA, touchB);
      gestureStateRef.current = {
        mode: "pinch",
        startDistance: getTouchDistance(touchA, touchB),
        startMidpoint: midpoint,
        startZoom: editorZoomRef.current,
        startOffset: { ...editorOffsetRef.current },
      };
      return;
    }

    if (gestureStateRef.current.mode === "pan" && event.touches.length === 1) {
      const touch = event.touches[0];
      const deltaX = touch.clientX - gestureStateRef.current.startMidpoint.x;
      const deltaY = touch.clientY - gestureStateRef.current.startMidpoint.y;
      const nextOffset = clampEditorOffset(
        {
          x: gestureStateRef.current.startOffset.x + deltaX,
          y: gestureStateRef.current.startOffset.y + deltaY,
        },
        editorZoomRef.current,
      );
      editorOffsetRef.current = nextOffset;
      setEditorOffset(nextOffset);
      return;
    }

    if (event.touches.length >= 2) {
      const [touchA, touchB] = [event.touches[0], event.touches[1]];
      const nextDistance = getTouchDistance(touchA, touchB);
      const nextMidpoint = getTouchMidpoint(touchA, touchB);
      const baselineDistance = gestureStateRef.current.startDistance || nextDistance;
      const zoomRatio = nextDistance / baselineDistance;
      const nextZoom = Math.min(
        MAX_EDITOR_ZOOM,
        Math.max(1, gestureStateRef.current.startZoom * zoomRatio),
      );
      const startFocalPoint = getEditorPointFromCenter(gestureStateRef.current.startMidpoint);
      const nextFocalPoint = getEditorPointFromCenter(nextMidpoint);
      const focalOffset = getOffsetForZoom(
        gestureStateRef.current.startOffset,
        gestureStateRef.current.startZoom,
        nextZoom,
        startFocalPoint,
      );
      const nextOffset = clampEditorOffset(
        {
          x: focalOffset.x + nextFocalPoint.x - startFocalPoint.x,
          y: focalOffset.y + nextFocalPoint.y - startFocalPoint.y,
        },
        nextZoom,
      );

      editorZoomRef.current = nextZoom;
      editorOffsetRef.current = nextOffset;
      setEditorZoom(nextZoom);
      setEditorOffset(nextOffset);
    }
  };

  const handleEditorTouchEnd = () => {
    if (!gestureStateRef.current) {
      return;
    }

    gestureStateRef.current = null;
  };

  const handleEditorTouchEndWithEvent = (event: React.TouchEvent<HTMLDivElement>) => {
    if (event.touches.length === 1) {
      const touch = event.touches[0];
      gestureStateRef.current = {
        mode: "pan",
        startDistance: 0,
        startMidpoint: { x: touch.clientX, y: touch.clientY },
        startZoom: editorZoomRef.current,
        startOffset: { ...editorOffsetRef.current },
      };
      return;
    }

    handleEditorTouchEnd();
  };

  const handleEditorPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || event.button !== 0) {
      return;
    }

    event.currentTarget.setPointerCapture(event.pointerId);
    gestureStateRef.current = {
      mode: "pan",
      startDistance: 0,
      startMidpoint: { x: event.clientX, y: event.clientY },
      startZoom: editorZoomRef.current,
      startOffset: { ...editorOffsetRef.current },
    };
  };

  const handleEditorPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch" || gestureStateRef.current?.mode !== "pan") {
      return;
    }

    const deltaX = event.clientX - gestureStateRef.current.startMidpoint.x;
    const deltaY = event.clientY - gestureStateRef.current.startMidpoint.y;
    const nextOffset = clampEditorOffset(
      {
        x: gestureStateRef.current.startOffset.x + deltaX,
        y: gestureStateRef.current.startOffset.y + deltaY,
      },
      editorZoomRef.current,
    );
    editorOffsetRef.current = nextOffset;
    setEditorOffset(nextOffset);
  };

  const handleEditorPointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.pointerType === "touch") {
      return;
    }

    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    gestureStateRef.current = null;
  };

  const handleAvatarEditorCancel = () => {
    setIsAvatarEditorOpen(false);
    if (pendingAvatarSourceUrl) {
      URL.revokeObjectURL(pendingAvatarSourceUrl);
    }
    setPendingAvatarFile(null);
    setPendingAvatarSourceUrl(null);
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setEditorImageSize({ width: 0, height: 0 });
    setEditorFrameSize({ width: 0, height: 0 });
    gestureStateRef.current = null;
  };

  const handleAvatarEditorSave = async () => {
    if (!pendingAvatarFile || !pendingAvatarSourceUrl || !avatarEditorFrameRef.current || !editorImageSize.width) {
      return;
    }

    try {
      const frameRect = avatarEditorFrameRef.current.getBoundingClientRect();
      const frameWidth = frameRect.width;
      const frameHeight = frameRect.height;
      if (!frameWidth || !frameHeight) return;

      const outputWidth = AVATAR_EXPORT_SIZE;
      const outputHeight = AVATAR_EXPORT_SIZE;
      const canvas = document.createElement("canvas");
      canvas.width = outputWidth;
      canvas.height = outputHeight;

      const ctx = canvas.getContext("2d");
      if (!ctx) return;

      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Failed to load selected image"));
        image.src = pendingAvatarSourceUrl;
      });

      ctx.fillStyle = "#000000";
      ctx.fillRect(0, 0, outputWidth, outputHeight);

      const frameSize = { width: frameWidth, height: frameHeight };
      const { surfaceSize, cropSize, renderedWidth, renderedHeight } = getEditorRenderState(
        editorZoom,
        editorImageSize,
        frameSize,
      );
      if (!surfaceSize || !cropSize) return;

      const clampedOffset = clampEditorOffset(
        editorOffset,
        editorZoom,
        editorImageSize,
        frameSize,
      );
      const cropLeft = (surfaceSize - cropSize) / 2;
      const cropTop = (surfaceSize - cropSize) / 2;
      const drawX = (surfaceSize - renderedWidth) / 2 + clampedOffset.x - cropLeft;
      const drawY = (surfaceSize - renderedHeight) / 2 + clampedOffset.y - cropTop;
      const renderToCanvasScale = outputWidth / cropSize;

      ctx.drawImage(
        image,
        drawX * renderToCanvasScale,
        drawY * renderToCanvasScale,
        renderedWidth * renderToCanvasScale,
        renderedHeight * renderToCanvasScale,
      );

      const blob = await new Promise<Blob | null>((resolve) => {
        canvas.toBlob((result) => resolve(result), "image/jpeg", 0.92);
      });
      if (!blob) return;

      const croppedAvatarFile = new File([blob], `avatar-${Date.now()}.jpg`, { type: "image/jpeg" });
      const croppedAvatarDataUrl = canvas.toDataURL("image/jpeg", 0.92);
      setAvatarFile(croppedAvatarFile);
      setAvatarPreview(croppedAvatarDataUrl);
      setAvatarMarkedForRemoval(false);
      setError(null);
      handleAvatarEditorCancel();
    } catch (err) {
      console.error("Error saving edited profile photo:", err);
      setError("We couldn't save that photo. Please try another image.");
    }
  };

  const handleAvatarRemove = useCallback(() => {
    webCameraRequestIdRef.current += 1;
    stopWebCameraStream();
    setIsWebCameraOpen(false);
    setWebCameraError(null);
    setWebCameraStarting(false);
    setWebCameraCapturing(false);
    setAvatarSourceLoading(null);
    setIsAvatarSourceDialogOpen(false);
    setIsAvatarEditorOpen(false);
    if (pendingAvatarSourceUrl) {
      URL.revokeObjectURL(pendingAvatarSourceUrl);
    }
    setPendingAvatarFile(null);
    setPendingAvatarSourceUrl(null);
    setEditorZoom(1);
    setEditorOffset({ x: 0, y: 0 });
    setEditorImageSize({ width: 0, height: 0 });
    setEditorFrameSize({ width: 0, height: 0 });
    gestureStateRef.current = null;
    setAvatarFile(null);
    setAvatarPreview(null);
    setAvatarMarkedForRemoval(true);
    setError(null);
  }, [pendingAvatarSourceUrl, stopWebCameraStream]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasAttemptedSubmit(true);

    if (!user?.id) {
      setError("Not authenticated");
      return;
    }

    if (!validateRequired()) {
      setError("Please fill out required fields.");
      return;
    }

    try {
      setSaving(true);
      setError(null);

      let avatarUrl: string | undefined;
      const shouldRemoveAvatar = avatarMarkedForRemoval && !avatarFile;

      if (avatarFile) {
        const uploadRes = await uploadAvatar(avatarFile, user.id);
        if (!uploadRes.success || !uploadRes.url) {
          setError(uploadRes.error || "Failed to upload profile picture");
          setSaving(false);
          return;
        }
        avatarUrl = uploadRes.url;
      }

      const result = await updateProfile(
        user.id,
        formData,
        avatarUrl
      );
      
      if (result.success && result.profile) {
        let savedProfile = result.profile;

        if (shouldRemoveAvatar) {
          const supabase = getSupabaseBrowser();
          if (!supabase) {
            setError("Supabase client not initialized");
            setSaving(false);
            return;
          }

          const { data: clearedProfile, error: clearAvatarError } = await supabase
            .from("profiles")
            .update({
              avatar_url: null,
              updated_at: new Date().toISOString(),
            })
            .eq("user_id", user.id)
            .select()
            .maybeSingle();

          if (clearAvatarError || !clearedProfile) {
            setError(clearAvatarError?.message || "Failed to remove profile picture");
            setSaving(false);
            return;
          }

          savedProfile = clearedProfile as Profile;
        }

        setSuccess(true);
        setProfile(savedProfile);
        setAvatarFile(null);
        setAvatarMarkedForRemoval(false);
        setAvatarPreview(savedProfile.avatar_url || null);

        if (onboarding) {
          try {
            const onboardingRes = await updateMyOnboarding({
              onboarding_version: 1,
              onboarding_step: null,
              onboarding_completed_at: new Date().toISOString(),
            });

            if (!onboardingRes.success) {
              console.error(
                "Failed to persist onboarding completion:",
                onboardingRes.error
              );
              setError(
                onboardingRes.error ??
                  "Failed to persist onboarding completion"
              );
            }
          } catch (e) {
            console.error("Failed to persist onboarding completion:", e);
          }
        }

        try {
          await refreshProfile();
        } catch (err) {
          console.error("Failed to refresh profile context:", err);
        }

        const redirectTarget =
          redirectPath && redirectPath.startsWith("/")
            ? redirectPath
            : "/profile";

        setTimeout(() => {
          router.replace(redirectTarget);
        }, 1500);
      } else {
        setError(result.error || "Failed to update profile");
      }
    } catch (err) {
      console.error("Error updating profile:", err);
      setError("An unexpected error occurred");
    } finally {
      setSaving(false);
    }
  };

  useEffect(() => {
    if (!isAvatarEditorOpen || !avatarEditorFrameRef.current) {
      return;
    }

    const updateFrameSize = () => {
      if (!avatarEditorFrameRef.current) return;
      const rect = avatarEditorFrameRef.current.getBoundingClientRect();
      setEditorFrameSize({ width: rect.width, height: rect.height });
    };

    updateFrameSize();
    const observer = new ResizeObserver(updateFrameSize);
    observer.observe(avatarEditorFrameRef.current);

    return () => {
      observer.disconnect();
    };
  }, [isAvatarEditorOpen]);

  useEffect(() => {
    if (!isAvatarEditorOpen || !editorImageSize.width || !editorFrameSize.width) {
      return;
    }

    setEditorOffset((currentOffset) => clampEditorOffset(currentOffset, editorZoom));
  }, [
    clampEditorOffset,
    editorFrameSize.width,
    editorFrameSize.height,
    editorImageSize.width,
    editorImageSize.height,
    editorZoom,
    isAvatarEditorOpen,
  ]);

  useEffect(() => {
    if (!isWebCameraOpen || !webCameraStream || !webCameraVideoRef.current) {
      return;
    }

    webCameraVideoRef.current.srcObject = webCameraStream;
    void webCameraVideoRef.current.play().catch((playError) => {
      console.error("Error playing web profile camera preview:", playError);
      setWebCameraError("Camera preview is not available in this browser. Choose from Library instead.");
      stopWebCameraStream();
    });
  }, [isWebCameraOpen, stopWebCameraStream, webCameraStream]);

  useEffect(() => {
    return () => {
      stopWebCameraStream();
    };
  }, [stopWebCameraStream]);

  useEffect(() => {
    return () => {
      if (pendingAvatarSourceUrl) {
        URL.revokeObjectURL(pendingAvatarSourceUrl);
      }
    };
  }, [pendingAvatarSourceUrl]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#0F0F12] text-zinc-100" aria-busy="true">
        <section className="w-full border-b border-white/5 bg-gradient-to-b from-[#08090E] via-[#0F0F12] to-[#0F0F12]">
          <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-4 pt-5">
            <header className="flex items-center gap-2.5 text-white/80">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/[0.04] text-white/35 ring-1 ring-white/10">
                <ArrowLeft className="h-5 w-5" aria-hidden="true" />
              </div>
              <div className="h-3 w-32 rounded-full bg-white/10" />
            </header>

            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-[#15161A]/85 px-4 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-5 sm:py-5">
              <div className="flex items-center gap-4 sm:gap-5">
                <div className="h-24 w-24 shrink-0 rounded-full border border-white/15 bg-black shadow-[0_14px_34px_rgba(0,0,0,0.38)] ring-1 ring-white/10 sm:h-28 sm:w-28">
                  <div className="h-full w-full animate-pulse rounded-full bg-white/[0.035]" />
                </div>
                <div className="min-w-0 flex-1 space-y-2.5">
                  <div className="h-2.5 w-28 rounded-full bg-white/10" />
                  <div className="h-4 w-36 rounded-full bg-white/15" />
                  <div className="space-y-1.5 pt-0.5">
                    <div className="h-2.5 w-full max-w-[250px] rounded-full bg-white/[0.08]" />
                    <div className="h-2.5 w-full max-w-[190px] rounded-full bg-white/[0.06]" />
                  </div>
                </div>
              </div>

              <div className="mt-4 border-t border-white/10 pt-4">
                <div className="mb-3 h-2.5 w-28 rounded-full bg-white/10" />
                <div className="flex gap-2 overflow-hidden">
                  {[0, 1, 2, 3].map((item) => (
                    <div
                      key={item}
                      className="flex h-10 shrink-0 items-center gap-2 rounded-full border border-white/10 bg-black/45 px-3"
                    >
                      <div className="h-5 w-5 rounded-full bg-white/[0.07]" />
                      <div className="h-2 w-12 rounded-full bg-white/[0.08]" />
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-3">
          <Card className="border border-white/5 bg-[#15161A] py-4 shadow-xl">
            <CardContent className="px-4 sm:px-6">
              <div className="space-y-6">
                <div className="space-y-2">
                  <div className="h-3 w-20 rounded-full bg-white/10" />
                  <div className="h-12 rounded-lg border border-white/5 bg-black ring-1 ring-black">
                    <div className="ml-3.5 mt-[1.125rem] h-3 w-36 animate-pulse rounded-full bg-white/[0.08]" />
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="h-3 w-20 rounded-full bg-white/10" />
                  <div className="relative h-12 rounded-lg border border-white/5 bg-black pl-8 ring-1 ring-black">
                    <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-medium text-zinc-500">
                      @
                    </span>
                    <div className="mt-[1.125rem] h-3 w-44 animate-pulse rounded-full bg-white/[0.08]" />
                  </div>
                  <div className="h-2.5 w-56 rounded-full bg-white/[0.07]" />
                </div>

                <div className="space-y-2">
                  <div className="h-3 w-10 rounded-full bg-white/10" />
                  <div className="min-h-[100px] rounded-lg border border-white/5 bg-black ring-1 ring-black">
                    <div className="space-y-2 px-3.5 pt-4">
                      <div className="h-3 w-40 animate-pulse rounded-full bg-white/[0.08]" />
                      <div className="h-3 w-full max-w-[320px] rounded-full bg-white/[0.06]" />
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Calendar className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                      <div className="h-3 w-24 rounded-full bg-white/10" />
                    </div>
                    <div className="h-12 rounded-lg border border-white/5 bg-black ring-1 ring-black">
                      <div className="ml-3.5 mt-[1.125rem] h-3 w-28 animate-pulse rounded-full bg-white/[0.08]" />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <MapPin className="h-4 w-4 text-zinc-500" aria-hidden="true" />
                      <div className="h-3 w-10 rounded-full bg-white/10" />
                    </div>
                    <div className="h-12 rounded-lg border border-white/5 bg-black ring-1 ring-black">
                      <div className="ml-3.5 mt-[1.125rem] h-3 w-32 animate-pulse rounded-full bg-white/[0.08]" />
                    </div>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <div className="h-3 w-28 rounded-full bg-white/10" />
                    <div className="h-2.5 w-14 rounded-full bg-emerald-400/25" />
                  </div>
                  <div className="h-7 w-14 rounded-full bg-emerald-500/55 p-1 shadow-lg">
                    <div className="h-5 w-5 rounded-full bg-white/85" />
                  </div>
                </div>

                <div className="pt-6">
                  <div className="h-14 rounded-xl border border-stone-400/10 bg-stone-600/55 shadow-[0_16px_38px_rgba(0,0,0,0.35)]">
                    <div className="mx-auto mt-[1.375rem] h-3 w-28 rounded-full bg-white/20" />
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </main>
      </div>
    );
  }

  if (error && !profile) {
    return (
      <div className="min-h-screen bg-[#0F0F12] flex items-center justify-center">
        <div className="text-center">
          <p className="text-zinc-300 mb-4">{error}</p>
          <button
            onClick={() => router.push("/dashboard")}
            className="px-4 py-2 bg-zinc-900 text-white rounded-lg hover:bg-zinc-800 border !border-black"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  const heroAvatarUrl = avatarMarkedForRemoval
    ? null
    : avatarPreview ?? profile.avatar_url ?? null;
  const heroName =
    formData.name.trim() ||
    formData.username.trim() ||
    profile.name?.trim() ||
    profile.username ||
    "Your profile";
  const {
    renderedWidth: editorRenderedWidth,
    renderedHeight: editorRenderedHeight,
  } = getEditorRenderState(editorZoom);

  return (
    <div className="min-h-screen bg-[#0F0F12] text-zinc-100">
      <section className="w-full border-b border-white/5 bg-gradient-to-b from-[#08090E] via-[#0F0F12] to-[#0F0F12]">
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-5 px-4 pb-4 pt-5">
          <header className="flex items-center gap-2.5 text-white/80">
            <Link href="/profile">
              <Button variant="ghost" size="sm" className="p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <span className="text-xs font-semibold uppercase tracking-[0.32em] text-white/60 sm:text-sm">
              Edit profile
            </span>
          </header>

          <div className="relative overflow-visible rounded-3xl border border-white/10 bg-[#15161A]/85 px-4 py-4 shadow-[0_24px_70px_rgba(0,0,0,0.42)] backdrop-blur-xl sm:px-5 sm:py-5">
            <div className="flex items-center gap-4 sm:gap-5">
              <Dialog.Root
                modal={false}
                open={isAvatarSourceDialogOpen}
                onOpenChange={(open) => {
                  if (!avatarSourceLoading) {
                    setIsAvatarSourceDialogOpen(open);
                  }
                }}
              >
                <div className="relative flex shrink-0 justify-center overflow-visible">
                  <Dialog.Trigger asChild>
                    <button
                      type="button"
                      disabled={avatarSourceLoading !== null}
                      aria-label="Change profile photo"
                      className="group relative h-24 w-24 overflow-hidden rounded-full border border-white/15 bg-black shadow-[0_14px_34px_rgba(0,0,0,0.38)] outline-none transition hover:border-white/30 active:scale-[0.99] focus-visible:ring-2 focus-visible:ring-white/70 focus-visible:ring-offset-2 focus-visible:ring-offset-[#15161A] disabled:cursor-not-allowed disabled:opacity-70 sm:h-28 sm:w-28"
                    >
                      {heroAvatarUrl ? (
                        <img
                          src={heroAvatarUrl}
                          alt={`${heroName}'s profile photo`}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="flex h-full w-full items-center justify-center bg-gradient-to-br from-zinc-800 via-zinc-900 to-black text-zinc-500">
                          <User className="h-10 w-10 sm:h-12 sm:w-12" aria-hidden="true" />
                        </span>
                      )}
                      <span
                        className="absolute inset-0 bg-black/0 transition group-hover:bg-black/10 group-active:bg-black/15"
                        aria-hidden="true"
                      />
                    </button>
                  </Dialog.Trigger>
                  <Dialog.Portal>
                    <Dialog.Content className="fixed left-1/2 top-[calc(env(safe-area-inset-top)+8.75rem)] z-50 w-[calc(100vw-2rem)] max-w-[17rem] -translate-x-1/2 rounded-[20px] border border-white/10 bg-[#05070c]/95 p-1.5 text-white shadow-[0_18px_50px_rgba(0,0,0,0.55)] backdrop-blur-xl focus:outline-none">
                      <Dialog.Title className="sr-only">Edit profile photo</Dialog.Title>
                      <div className="grid gap-1">
                        <button
                          type="button"
                          disabled={avatarSourceLoading !== null}
                          onClick={() => handleAvatarSourceSelect("photos")}
                          className="flex min-h-11 items-center justify-start gap-3 rounded-2xl px-3.5 text-left text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Images className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden="true" />
                          <span>{AVATAR_PHOTO_SOURCE_LABELS.photos}</span>
                        </button>
                        <button
                          type="button"
                          disabled={avatarSourceLoading !== null}
                          onClick={() => handleAvatarSourceSelect("camera")}
                          className="flex min-h-11 items-center justify-start gap-3 rounded-2xl px-3.5 text-left text-sm font-semibold text-white transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Camera className="h-4 w-4 shrink-0 text-zinc-300" aria-hidden="true" />
                          <span>{AVATAR_PHOTO_SOURCE_LABELS.camera}</span>
                        </button>
                        <button
                          type="button"
                          disabled={avatarSourceLoading !== null}
                          onClick={handleAvatarRemove}
                          className="flex min-h-11 items-center justify-start gap-3 rounded-2xl px-3.5 text-left text-sm font-semibold text-red-300 transition hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-60"
                        >
                          <Trash2 className="h-4 w-4 shrink-0 text-red-300/85" aria-hidden="true" />
                          <span>Remove Photo</span>
                        </button>
                      </div>
                    </Dialog.Content>
                  </Dialog.Portal>
                </div>
              </Dialog.Root>
              <div className="min-w-0 flex-1">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/55">
                  Profile photo
                </p>
                <p className="mt-1 text-sm font-medium text-white">
                  {heroAvatarUrl ? "Update your photo" : "Add a profile photo"}
                </p>
                <p className="mt-1 text-xs leading-5 text-zinc-400">
                  Tap the avatar to choose, capture, adjust, or remove it.
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-white/10 pt-4">
              <div className="mb-3 flex items-center justify-between gap-3">
                <p className="text-[0.68rem] font-semibold uppercase tracking-[0.32em] text-white/55">
                  Social links
                </p>
              </div>
              <SocialPillsRow
                socials={socialsData}
                editMode
                onPlatformSelect={handlePlatformSelection}
              />
            </div>
          </div>
        </div>
      </section>
      <input
        ref={webPhotoLibraryInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleWebLibraryFileChange}
      />
      <Dialog.Root
        open={isWebCameraOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleWebCameraCancel();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[230] w-[min(95vw,460px)] -translate-x-1/2 -translate-y-1/2 rounded-[28px] border border-white/10 bg-[#05070c] p-4 text-white shadow-[0_30px_80px_rgba(0,0,0,0.65)] focus:outline-none sm:p-5">
            <div className="space-y-4">
              <div className="space-y-1">
                <Dialog.Title className="text-lg font-semibold">Take Photo</Dialog.Title>
              </div>
              <div className="relative aspect-[3/4] w-full overflow-hidden rounded-[24px] border border-white/10 bg-black">
                <video
                  ref={webCameraVideoRef}
                  autoPlay
                  muted
                  playsInline
                  className="h-full w-full object-cover"
                />
                {webCameraStarting ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-black/70 text-sm text-zinc-300">
                    Opening camera...
                  </div>
                ) : null}
                {webCameraError ? (
                  <div className="absolute inset-0 flex flex-col items-center justify-center gap-4 bg-black/85 px-6 text-center">
                    <p className="text-sm leading-6 text-zinc-200">{webCameraError}</p>
                    <Button type="button" size="sm" onClick={handleWebAvatarLibrary}>
                      Choose from Library
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={handleWebCameraCancel}>
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleWebCameraCapture}
                  disabled={webCameraStarting || webCameraCapturing || Boolean(webCameraError)}
                >
                  {webCameraCapturing ? "Capturing..." : "Capture"}
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={isAvatarEditorOpen}
        onOpenChange={(open) => {
          if (!open) {
            handleAvatarEditorCancel();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[220] bg-black/80 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[230] max-h-[calc(100dvh-1.5rem)] w-[min(94vw,460px)] -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] border border-white/10 bg-[#05070c] p-4 text-white shadow-[0_30px_80px_rgba(0,0,0,0.65)] focus:outline-none sm:p-5">
            <div className="space-y-3.5">
              <div className="space-y-1">
                <Dialog.Title className="text-lg font-semibold">Adjust profile photo</Dialog.Title>
                <Dialog.Description className="text-sm text-zinc-400">
                  Move and zoom to frame your avatar.
                </Dialog.Description>
              </div>
              <div
                ref={avatarEditorFrameRef}
                className="relative mx-auto aspect-square w-full max-w-[min(100%,420px)] cursor-grab touch-none select-none overflow-hidden rounded-2xl border border-white/10 bg-black active:cursor-grabbing"
                onTouchStart={handleEditorTouchStart}
                onTouchMove={handleEditorTouchMove}
                onTouchEnd={handleEditorTouchEndWithEvent}
                onTouchCancel={handleEditorTouchEnd}
                onPointerDown={handleEditorPointerDown}
                onPointerMove={handleEditorPointerMove}
                onPointerUp={handleEditorPointerEnd}
                onPointerCancel={handleEditorPointerEnd}
                style={{
                  touchAction: "none",
                  overscrollBehavior: "contain",
                  WebkitUserSelect: "none",
                }}
              >
                {pendingAvatarSourceUrl ? (
                  <img
                    src={pendingAvatarSourceUrl}
                    alt="Selected profile"
                    draggable={false}
                    onLoad={(event) => {
                      const imageSize = {
                        width: event.currentTarget.naturalWidth,
                        height: event.currentTarget.naturalHeight,
                      };
                      setEditorImageSize(imageSize);
                      setEditorZoom(1);
                      setEditorOffset({ x: 0, y: 0 });
                    }}
                    className="absolute left-1/2 top-1/2 max-w-none"
                    style={{
                      width: `${Math.max(editorRenderedWidth, 1)}px`,
                      height: `${Math.max(editorRenderedHeight, 1)}px`,
                      transform: `translate(calc(-50% + ${editorOffset.x}px), calc(-50% + ${editorOffset.y}px))`,
                      transformOrigin: "center center",
                      userSelect: "none",
                      WebkitUserSelect: "none",
                      pointerEvents: "none",
                    }}
                  />
                ) : null}
                <div
                  className="pointer-events-none absolute inset-0 bg-black/45"
                  style={{
                    WebkitMaskImage:
                      "radial-gradient(circle at center, transparent 0 39%, rgba(0,0,0,0.35) 41%, black 48%)",
                    maskImage:
                      "radial-gradient(circle at center, transparent 0 39%, rgba(0,0,0,0.35) 41%, black 48%)",
                  }}
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute left-1/2 top-1/2 aspect-square w-[78%] -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white/85"
                  aria-hidden="true"
                />
                <div
                  className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-white/10"
                  aria-hidden="true"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-1">
                <Button type="button" variant="ghost" onClick={handleAvatarEditorCancel}>
                  Cancel
                </Button>
                <Button type="button" onClick={handleAvatarEditorSave}>
                  Save photo
                </Button>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 px-4 pb-10 pt-3">
        {onboarding && (
          <div className="rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-zinc-200">
            <p className="font-medium">Complete your profile to continue.</p>
            <p className="mt-1 text-zinc-400">
              Add your name, username, and details so we can personalize your experience.
            </p>
            {redirectPath && redirectPath.startsWith("/") && (
              <p className="mt-2 text-xs text-zinc-500">
                You&apos;ll be redirected back to {redirectPath} once you&apos;re finished.
              </p>
            )}
          </div>
        )}
        <Card className="border border-white/5 bg-[#15161A] py-4 shadow-xl">
          <CardContent className="px-4 sm:px-6">
            {success && (
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <p className="text-zinc-200 text-center">
                  Profile updated successfully! Redirecting...
                </p>
              </div>
            )}

            {error && (
              <div className="mb-6 p-4 bg-white/5 border border-white/10 rounded-lg">
                <p className="text-zinc-300 text-center">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="space-y-6">
              {/* Name */}
              <div className="space-y-2">
                <Label htmlFor="name">
                  Full Name
                  {hasAttemptedSubmit ? (
                    <span className="text-red-400 ml-1">*</span>
                  ) : null}
                </Label>
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleInputChange("name", e.target.value)}
                  placeholder="Enter your full name"
                  className={`h-12 text-lg bg-black text-white placeholder:text-zinc-500 ${
                    hasAttemptedSubmit && fieldErrors.name
                      ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/60"
                      : "!border-black focus-visible:border-zinc-200 focus-visible:ring-white/20"
                  }`}
                />
                {hasAttemptedSubmit && fieldErrors.name ? (
                  <p className="text-sm text-red-400">{fieldErrors.name}</p>
                ) : null}
              </div>

              {/* Username */}
              <div className="space-y-2">
                <Label htmlFor="username">
                  Username
                  {hasAttemptedSubmit ? (
                    <span className="text-red-400 ml-1">*</span>
                  ) : null}
                </Label>
                <div className="relative">
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-lg font-medium text-zinc-500"
                  >
                    @
                  </span>
                  <Input
                    id="username"
                    type="text"
                    value={formData.username}
                    onChange={(e) => handleInputChange("username", e.target.value)}
                    placeholder="Choose a unique username"
                    className={`h-12 bg-black pl-8 text-lg text-white placeholder:text-zinc-500 ${
                      hasAttemptedSubmit && fieldErrors.username
                        ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/60"
                        : "!border-black focus-visible:border-zinc-200 focus-visible:ring-white/20"
                    }`}
                  />
                </div>
                <p className="text-sm text-zinc-400">
                  This will be your unique identifier: @{formData.username || "username"}
                </p>
                {hasAttemptedSubmit && fieldErrors.username ? (
                  <p className="text-sm text-red-400">{fieldErrors.username}</p>
                ) : null}
              </div>

              {/* Bio */}
              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Textarea
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => handleInputChange("bio", e.target.value)}
                  placeholder="Tell us about yourself..."
                  className="min-h-[100px] text-lg resize-none bg-black text-white !border-black placeholder:text-zinc-500 focus-visible:ring-white/20 focus-visible:ring-offset-0"
                />
              </div>

              {/* Date of Birth */}
              <div className="space-y-2">
                <Label htmlFor="dob" className="flex items-center space-x-2">
                  <Calendar className="h-4 w-4 text-zinc-400" />
                  <span>
                    Date of Birth
                    {hasAttemptedSubmit ? (
                      <span className="text-red-400 ml-1">*</span>
                    ) : null}
                  </span>
                </Label>
                <div className="relative">
                  <Input
                    id="dob"
                    type="date"
                    value={formData.dob}
                    onChange={(e) => handleInputChange("dob", e.target.value)}
                    className={`h-12 w-full rounded-lg border bg-black text-lg text-white placeholder:text-zinc-500 transition-colors duration-200 appearance-none ${
                      hasAttemptedSubmit && fieldErrors.dob
                        ? "border-red-500 focus-visible:border-red-500 focus-visible:ring-red-500/60"
                        : "!border-black focus-visible:border-zinc-200 focus-visible:ring-white/20"
                    } pr-12 pl-4`}
                  />
                  <Calendar className="pointer-events-none absolute right-3 top-1/2 h-5 w-5 -translate-y-1/2 text-white/70" />
                </div>
                {hasAttemptedSubmit && fieldErrors.dob ? (
                  <p className="text-sm text-red-400">{fieldErrors.dob}</p>
                ) : null}
              </div>

              {/* City */}
              <div className="space-y-2">
                <Label htmlFor="city" className="flex items-center space-x-2">
                  <MapPin className="h-4 w-4 text-zinc-400" />
                  <span>City</span>
                </Label>
                <Input
                  id="city"
                  type="text"
                  value={formData.city}
                  onChange={(e) => handleInputChange("city", e.target.value)}
                  placeholder="Where are you located?"
                  className="h-12 text-lg bg-black text-white !border-black placeholder:text-zinc-500 focus-visible:border-zinc-200 focus-visible:ring-white/20"
                />
              </div>

              {/* Privacy Toggle */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-zinc-200">
                    Profile visibility
                  </span>
                    <span
                      className={`text-xs uppercase tracking-[0.3em] transition-colors duration-300 ${
                        formData.is_private ? "text-zinc-400" : "text-emerald-400"
                      }`}
                      aria-live="polite"
                    >
                      {formData.is_private ? "Private" : "Public"}
                    </span>
                  </div>
                  <label className="relative inline-flex h-7 w-14 cursor-pointer items-center">
                    <input
                      type="checkbox"
                      className="peer sr-only"
                      checked={formData.is_private ?? false}
                      onChange={(e) => handlePrivacyChange(e.target.checked)}
                    />
                    <span className="absolute inset-0 rounded-full bg-emerald-500 transition-colors duration-300 ease-out peer-checked:bg-zinc-700 peer-focus-visible:ring-2 peer-focus-visible:ring-white/70" />
                    <span className="absolute left-1 top-1 h-5 w-5 rounded-full bg-white shadow-lg transition-transform duration-300 ease-out peer-checked:translate-x-7" />
                  </label>
              </div>

              {/* Submit Button */}
              <div className="pt-6">
                <Button
                  type="submit"
                  disabled={saving}
                  className="h-14 w-full rounded-xl border border-stone-400/20 bg-stone-600 text-lg font-semibold text-white shadow-[0_16px_38px_rgba(0,0,0,0.35)] transition-all duration-200 hover:border-stone-300/30 hover:bg-stone-500 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {saving ? (
                    <div className="flex items-center space-x-2">
                      <div className="h-5 w-5 animate-spin rounded-full border-b-2 border-white"></div>
                      <span>Saving...</span>
                    </div>
                  ) : (
                    <div className="flex items-center space-x-2">
                      <Save className="h-5 w-5" />
                      <span>Save Changes</span>
                    </div>
                  )}
                </Button>
              </div>
            </form>
          </CardContent>
        </Card>
      </main>

      {hasLinkedAccounts ? (
        <div className="mx-auto w-full max-w-5xl px-4 pb-10">
          <div className="border-b border-white/10 pb-4">
            <div className="space-y-1 max-w-2xl">
              <p className="text-xs font-semibold uppercase tracking-[0.35em] text-white/60">
                Linked accounts
              </p>
              <p className="text-sm text-zinc-400">
                Your audience sees these profiles on your page.
              </p>
            </div>
          </div>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            {activeLinkedAccounts.map((account) => {
              const platformKey = (account.platform ?? "").toLowerCase();
              const definition = getSocialIconDefinition(platformKey);
              const Icon = definition.icon;
              let subtext = account.username ? `@${account.username}` : undefined;
              if (!subtext && account.url) {
                try {
                  subtext = new URL(account.url).hostname;
                } catch {
                  subtext = account.url;
                }
              }

              if (!account.url) {
                return null;
              }

              return (
                <a
                  key={`${platformKey}-${account.url}`}
                  href={account.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/5 px-4 py-3 transition hover:border-white/30"
                >
                  <span className="flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-black/40 text-white">
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <div className="flex flex-col">
                    <span className="text-sm font-semibold text-white">
                      {definition.label}
                    </span>
                    {subtext ? (
                      <span className="text-xs uppercase tracking-[0.35em] text-white/50">
                        {subtext}
                      </span>
                    ) : null}
                  </div>
                </a>
              );
            })}
          </div>
        </div>
      ) : null}

      {user?.id ? (
        <section className="mx-auto w-full max-w-6xl px-4 py-12">
          <ContentCardManager userId={user.id} onCardsChange={refreshProfile} />
        </section>
      ) : null}

      <Dialog.Root open={isSocialPickerOpen} onOpenChange={setIsSocialPickerOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[260] bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[270] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[28px] border border-white/10 bg-[#07090E]/95 p-4 text-white shadow-[0_30px_90px_rgba(0,0,0,0.72)] backdrop-blur-2xl focus:outline-none sm:p-5">
            <div className="flex items-start justify-between gap-4">
              <div className="space-y-1">
                <Dialog.Title className="text-base font-semibold text-white">
                  Social links
                </Dialog.Title>
                <Dialog.Description className="text-sm text-zinc-400">
                  Choose a platform to add or edit.
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  aria-label="Close social links"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-4 grid gap-2">
              {LINKED_ACCOUNT_ORDER.map((platform) => {
                const definition = getSocialIconDefinition(platform);
                const Icon = definition.icon;
                const prefilledHandle = linkedHandlePrefills[platform];

                return (
                  <button
                    key={platform}
                    type="button"
                    onClick={() => handlePlatformSelection(platform)}
                    className="flex min-h-14 w-full items-center gap-3 rounded-2xl border border-white/[0.08] bg-white/[0.035] px-3.5 py-2.5 text-left transition hover:border-white/[0.18] hover:bg-white/[0.075] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70"
                  >
                    <span
                      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-white ${definition.background}`}
                      aria-hidden="true"
                    >
                      <Icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold text-white">
                        {definition.label}
                      </span>
                      <span className="block truncate text-xs text-zinc-500">
                        {prefilledHandle ? `@${prefilledHandle}` : "Add account"}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>

      <Dialog.Root
        open={Boolean(inlineSelectedPlatform)}
        onOpenChange={(open) => {
          if (!open && !inlineSaving) {
            closeSocialEditor();
          }
        }}
      >
        <Dialog.Portal>
          <Dialog.Overlay className="fixed inset-0 z-[260] bg-black/75 backdrop-blur-sm" />
          <Dialog.Content className="fixed left-1/2 top-1/2 z-[270] max-h-[calc(100dvh-2rem)] w-[calc(100vw-2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-[30px] border border-white/10 bg-[#07090E]/95 p-5 text-white shadow-[0_30px_90px_rgba(0,0,0,0.72)] backdrop-blur-2xl focus:outline-none sm:p-6">
            <div className="flex items-start justify-between gap-4">
              <div className="flex min-w-0 items-center gap-3">
                {InlinePlatformIcon ? (
                  <span
                    className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border border-white/15 bg-white/[0.045] text-white shadow-[0_14px_34px_rgba(0,0,0,0.3)]"
                    aria-hidden="true"
                  >
                    <InlinePlatformIcon className="h-6 w-6" />
                  </span>
                ) : null}
                <div className="min-w-0">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.34em] text-white/55">
                    {inlineCanRemove ? "Edit platform" : "Add platform"}
                  </p>
                  <Dialog.Title className="truncate text-xl font-semibold text-white">
                    {inlinePlatformDefinition?.label ?? "Add account"}
                  </Dialog.Title>
                </div>
              </div>
              <Dialog.Close asChild>
                <button
                  type="button"
                  disabled={inlineSaving}
                  className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] text-white/70 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/70 disabled:cursor-not-allowed disabled:opacity-50"
                  aria-label="Close social link editor"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </Dialog.Close>
            </div>
            <div className="mt-5 space-y-3">
              <Input
                value={inlineHandle}
                onChange={(e) => setInlineHandle(e.target.value)}
                placeholder="Username or URL"
                className="h-12 rounded-2xl border border-white/15 bg-white/[0.055] text-sm text-white placeholder:text-white/40 focus-visible:border-white/40 focus-visible:bg-white/[0.08] focus-visible:ring-white/15"
                aria-label={`Add ${inlinePlatformDefinition?.label ?? "platform"} handle`}
              />
              {inlineError ? (
                <p className="text-xs text-red-300">{inlineError}</p>
              ) : null}
              <div className="flex flex-col-reverse gap-2 pt-1 sm:flex-row sm:items-center sm:justify-between">
                {inlineCanRemove ? (
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={handleInlineRemove}
                    disabled={inlineSaving}
                    className="justify-center text-red-300 hover:bg-red-500/10 hover:text-red-200 sm:justify-start"
                  >
                    <Trash2 className="h-4 w-4" aria-hidden="true" />
                    {inlineAction === "remove" ? "Removing..." : "Remove"}
                  </Button>
                ) : (
                  <span aria-hidden="true" />
                )}
                <div className="flex justify-end gap-2">
                  <Dialog.Close asChild>
                    <Button type="button" variant="ghost" disabled={inlineSaving}>
                      Cancel
                    </Button>
                  </Dialog.Close>
                  <Button type="button" onClick={handleInlineSave} disabled={inlineSaving}>
                    {inlineAction === "save" ? "Saving..." : "Save link"}
                  </Button>
                </div>
              </div>
            </div>
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
