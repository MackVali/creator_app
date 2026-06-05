# CREATOR Toast Inventory

## Shared toast system

File:
- `components/ui/toast.tsx`

Current behavior:
- Custom React context provider, not Sonner/shadcn toast.
- Mounted through `ToastProvider`.
- Helpers exposed through `useToastHelpers()`.
- Supported types: `success`, `error`, `warning`, `info`.
- Auto-dismisses after 5 seconds.
- Manual close button with `X`.
- Optional retry action only exists on `toast.error(title, description, retry)`.

Current styling:
- Position: fixed top-right.
- Container: `fixed top-4 right-4 z-50 space-y-2 max-w-sm`.
- Toast card: `rounded-lg border p-4 shadow-lg transition-all duration-300 ease-in-out`.
- Success: green icon, `border-green-200 bg-green-50`.
- Error: red icon, `border-red-200 bg-red-50`.
- Warning: yellow icon, `border-yellow-200 bg-yellow-50`.
- Info: blue icon, `border-blue-200 bg-blue-50`.
- Title: `text-sm font-medium text-gray-900`.
- Description: `text-sm text-gray-600`.
- Action: blue text.
- Close: gray text.

## Toast usage summary by file

- `components/LevelUpListener.tsx`: realtime XP level-up success toast.
- `components/WindowsPolishedUI.tsx`: 1 error.
- `components/ui/EventModal.tsx`: 36 errors, 2 successes.
- `components/ui/Fab.tsx`: 10 errors, 7 successes.
- `components/ui/NoteModal.tsx`: 4 errors, 1 success.
- `components/ui/PostModal.tsx`: 3 errors, 1 success.
- `src/app/(app)/dashboard/_skills/SkillsCarousel.tsx`: 4 errors, 2 infos, 2 successes.
- `src/app/(app)/goals/[goalId]/plan/page.tsx`: 9 errors, 2 warnings, 1 success.
- `src/app/(app)/goals/components/CampaignCard.tsx`: 1 info.
- `src/app/(app)/goals/components/GoalCard.tsx`: 1 info.
- `src/app/(app)/profile/LinkMeProfile.tsx`: 4 errors, 2 successes.
- `src/app/(app)/profile/edit/ProfileEditForm.tsx`: 3 errors, 1 success.
- `src/app/(app)/schedule/ScheduleTabContent.tsx`: 2 errors, 1 warning, 1 success.
- `src/app/(app)/skills/[id]/page.tsx`: 5 errors, 2 successes.
- `src/components/command/CommandCirclesSection.tsx`: 1 success.
- `src/components/friends/MessageFriendButton.tsx`: 2 errors, 1 success.
- `src/components/monuments/MonumentGoalsList.tsx`: 1 error.
- `src/components/monuments/MonumentRelatedHabits.tsx`: 1 error.
- `src/components/profile/ContentCardManager.tsx`: 3 errors, 4 successes.

## Main copy/style issues noticed

- Many generic titles: `Error`, `Saved`, `Loading`, `Success`.
- EventModal has the most validation/error toast noise.
- FAB has dynamic success labels and tag attachment follow-up errors.
- Some success toasts are bare title-only, like `Goal updated`, `Project updated`, `Task updated`, `Habit updated`, `Note saved`.
- Level-up toast says: `${skillName} leveled up!` / `Now level ${event.new_skill_level}`.
- Current design is light/system default and probably does not match the darker CREATOR app styling.
