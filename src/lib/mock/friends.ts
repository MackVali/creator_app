export type Friend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  hasRing?: boolean;   // show gradient ring like IG story
  isOnline?: boolean;
};

export const MOCK_FRIENDS: Friend[] = [
  { id: 'u1', username: 'goldenchassyy', displayName: 'CHASSY', avatarUrl: 'https://i.pravatar.cc/96?img=12', hasRing: true },
  { id: 'u2', username: 'kaelo3g_',      displayName: 'kaelo',  avatarUrl: 'https://i.pravatar.cc/96?img=23' },
  { id: 'u3', username: 'simonerosset...', displayName: 'simo', avatarUrl: 'https://i.pravatar.cc/96?img=31', hasRing: true },
  { id: 'u4', username: 'thepathwand...', displayName: 'The Fool', avatarUrl: 'https://i.pravatar.cc/96?img=44', hasRing: true },
  { id: 'u5', username: 'band0lph',      displayName: 'Dook',   avatarUrl: 'https://i.pravatar.cc/96?img=5' },
  { id: 'u6', username: 'daryn.lene',    displayName: 'Daryn Lene', avatarUrl: 'https://i.pravatar.cc/96?img=18' },
  { id: 'u7', username: 'robert_wynia',  displayName: 'Robert R Wyni...', avatarUrl: 'https://i.pravatar.cc/96?img=9' },
  { id: 'u8', username: 'jamieclaeys',   displayName: 'jamie',  avatarUrl: 'https://i.pravatar.cc/96?img=15' },
  { id: 'u9', username: 'shelbyxo',      displayName: 'Shelby', avatarUrl: 'https://i.pravatar.cc/96?img=1' },
  { id: 'u10', username: 'kevinb',       displayName: 'Kevin',  avatarUrl: 'https://i.pravatar.cc/96?img=7' },
  { id: 'u11', username: 'nat',          displayName: 'Natalie', avatarUrl: 'https://i.pravatar.cc/96?img=49', hasRing: true },
  { id: 'u12', username: 'zay',          displayName: 'Zay',     avatarUrl: 'https://i.pravatar.cc/96?img=11' },
  { id: 'u13', username: 'tiffany',      displayName: 'Tiffany', avatarUrl: 'https://i.pravatar.cc/96?img=36' },
  { id: 'u14', username: 'mike',         displayName: 'Mike',    avatarUrl: 'https://i.pravatar.cc/96?img=2' },
];
