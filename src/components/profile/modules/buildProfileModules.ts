import {
  ContentCard,
  Profile,
  ProfileModule,
  ProfileModuleLinkCards,
  ProfileModuleType,
} from "@/lib/types";

function baseModule<T extends ProfileModuleType>(
  type: T,
  position: number,
  overrides: Partial<ProfileModule> = {},
): ProfileModuleBaseForType<T> {
  return {
    id: overrides.id ?? `${type}-${position}`,
    type,
    title: overrides.title ?? null,
    subtitle: overrides.subtitle ?? null,
    position,
    is_active: overrides.is_active ?? true,
    analytics_event_prefix: overrides.analytics_event_prefix ?? `profile.${type}`,
    layout_variant: overrides.layout_variant ?? null,
    settings: overrides.settings ?? null,
  } as ProfileModuleBaseForType<T>;
}

type ProfileModuleBaseForType<T extends ProfileModuleType> = Extract<ProfileModule, { type: T }>;

export interface BuildProfileModulesArgs {
  profile: Profile;
  contentCards: ContentCard[];
}

export function buildProfileModules({
  profile,
  contentCards,
}: BuildProfileModulesArgs): ProfileModule[] {
  const modules: ProfileModule[] = [];

  const activeCards = (contentCards || []).filter((card) => card.is_active !== false);
  const linkCardsModule: ProfileModuleLinkCards = {
    ...baseModule("link_cards", modules.length, {
      id: "link-cards",
      title: "Link cards",
      subtitle: "Stacked call-to-action tiles visitors can tap through.",
    }),
    cards: activeCards.sort((a, b) => a.position - b.position),
    layout: "stacked",
  };

  modules.push(linkCardsModule);

  return modules.map((module, index) => ({ ...module, position: index }));
}
