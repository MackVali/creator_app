export const NOTE_SOFT_OLED = {
  backdrop: "#020203",
  surface: "#060607",
  title: "#F8F8FA",
  heading1: "#F6F6F8",
  heading2: "#F1F1F4",
  body: "#ECECF1",
  secondary: "rgba(235,235,245,0.60)",
  tertiary: "rgba(235,235,245,0.34)",
  placeholder: "rgba(235,235,245,0.30)",
  toolbar: "rgba(22,22,24,0.94)",
  toolbarIcon: "rgba(235,235,245,0.62)",
  toolbarIconActive: "#F4F4F7",
  toolbarBorder: "rgba(255,255,255,0.08)",
} as const;

export const NOTE_SOFT_OLED_CLASSES = {
  backdrop: "bg-[#020203]",
  surface: "bg-[#060607]",
  title: "text-[#F8F8FA]",
  heading1: "text-[#F6F6F8]",
  heading2: "text-[#F1F1F4]",
  body: "text-[#ECECF1]",
  checkedBody: "text-[rgba(235,235,245,0.60)]",
  secondary: "text-[rgba(235,235,245,0.60)]",
  tertiary: "text-[rgba(235,235,245,0.34)]",
  placeholder: "placeholder:text-[rgba(235,235,245,0.30)]",
  beforePlaceholder: "empty:before:text-[rgba(235,235,245,0.30)]",
  caret: "caret-[#ECECF1]",
  toolbar: "border-white/[0.08] bg-[rgba(22,22,24,0.94)]",
  toolbarButton: "border-transparent bg-transparent text-[rgba(235,235,245,0.62)]",
  toolbarButtonActive: "border-white/15 bg-white/[0.08] text-[#F4F4F7]",
  toolbarButtonHover:
    "hover:bg-white/[0.05] hover:text-[#F4F4F7] focus-visible:ring-1 focus-visible:ring-white/20 active:bg-white/[0.08]",
  toolbarPanel: "border-white/[0.08] bg-[rgba(22,22,24,0.94)]",
  toolbarPanelItem:
    "text-[rgba(235,235,245,0.62)] hover:bg-white/[0.07] hover:text-[#F4F4F7]",
} as const;
