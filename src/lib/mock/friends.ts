export type Friend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  profileUrl: string;
  hasRing?: boolean;   // show gradient ring like IG story
  isOnline?: boolean;
};

export type FriendRequest = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mutualFriends: number;
  note?: string;
};

export type SentInvite = {
  id: string;
  email: string;
  sentAgo: string;
  status: 'pending' | 'accepted' | 'expired';
};

export type SuggestedFriend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mutualFriends: number;
  reason: string;
};

export type DiscoveryProfile = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  mutualFriends: number;
  highlight: string;
  role: string;
};

export const MOCK_FRIENDS: Friend[] = [
  {
    id: 'u1',
    username: 'champagnepapi',
    displayName: 'Drake',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Drake_at_Sound_Academy_Toronto_Canada_2016-03-14.jpg/160px-Drake_at_Sound_Academy_Toronto_Canada_2016-03-14.jpg',
    profileUrl: 'https://www.instagram.com/champagnepapi/',
    hasRing: true,
  },
  {
    id: 'u2',
    username: 'kendricklamar',
    displayName: 'Kendrick Lamar',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Kendrick_Lamar_Lollapalooza_2016-2.jpg/160px-Kendrick_Lamar_Lollapalooza_2016-2.jpg',
    profileUrl: 'https://www.instagram.com/kendricklamar/',
  },
  {
    id: 'u3',
    username: 'nickiminaj',
    displayName: 'Nicki Minaj',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Nicki_Minaj_NBC_2022.jpg/160px-Nicki_Minaj_NBC_2022.jpg',
    profileUrl: 'https://www.instagram.com/nickiminaj/',
    hasRing: true,
  },
  {
    id: 'u4',
    username: 'officialjayz',
    displayName: 'Jay-Z',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Jay-Z_2011.jpg/160px-Jay-Z_2011.jpg',
    profileUrl: 'https://www.instagram.com/officialjayz/',
    hasRing: true,
  },
  {
    id: 'u5',
    username: 'realcoleworld',
    displayName: 'J. Cole',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/J._Cole_2018.jpg/160px-J._Cole_2018.jpg',
    profileUrl: 'https://www.instagram.com/realcoleworld/',
  },
  {
    id: 'u6',
    username: 'snoopdogg',
    displayName: 'Snoop Dogg',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Snoop_Dogg_2019_by_Glenn_Francis.jpg/160px-Snoop_Dogg_2019_by_Glenn_Francis.jpg',
    profileUrl: 'https://www.instagram.com/snoopdogg/',
  },
  {
    id: 'u7',
    username: 'kanyewest',
    displayName: 'Kanye West',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Kanye_West_at_the_2009_Tribeca_Film_Festival.jpg/160px-Kanye_West_at_the_2009_Tribeca_Film_Festival.jpg',
    profileUrl: 'https://www.instagram.com/kanyewest/',
  },
  {
    id: 'u8',
    username: 'eminem',
    displayName: 'Eminem',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Eminem@Dublin.jpg/160px-Eminem@Dublin.jpg',
    profileUrl: 'https://www.instagram.com/eminem/',
  },
  {
    id: 'u9',
    username: 'iamcardib',
    displayName: 'Cardi B',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Cardi_B_2018.jpg/160px-Cardi_B_2018.jpg',
    profileUrl: 'https://www.instagram.com/iamcardib/',
  },
  {
    id: 'u10',
    username: 'travisscott',
    displayName: 'Travis Scott',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Travis_Scott_August_2019.jpg/160px-Travis_Scott_August_2019.jpg',
    profileUrl: 'https://www.instagram.com/travisscott/',
  },
  {
    id: 'u11',
    username: 'liltunechi',
    displayName: 'Lil Wayne',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Lil_Wayne_2011.jpg/160px-Lil_Wayne_2011.jpg',
    profileUrl: 'https://www.instagram.com/liltunechi/',
    hasRing: true,
  },
  {
    id: 'u12',
    username: 'asaprocky',
    displayName: 'A$AP Rocky',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/ASAP_Rocky_2013.jpg/160px-ASAP_Rocky_2013.jpg',
    profileUrl: 'https://www.instagram.com/asaprocky/',
  },
  {
    id: 'u13',
    username: '50cent',
    displayName: '50 Cent',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/50_Cent_2018.jpg/160px-50_Cent_2018.jpg',
    profileUrl: 'https://www.instagram.com/50cent/',
  },
  {
    id: 'u14',
    username: 'icecube',
    displayName: 'Ice Cube',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Ice_Cube_2014.jpg/160px-Ice_Cube_2014.jpg',
    profileUrl: 'https://www.instagram.com/icecube/',
  },
];

export const MOCK_FRIEND_REQUESTS: FriendRequest[] = [
  {
    id: 'r1',
    username: 'dualipa',
    displayName: 'Dua Lipa',
    avatarUrl: 'https://i.pravatar.cc/96?img=58',
    mutualFriends: 8,
    note: 'Hey! Saw you at the listening party—would love to connect.',
  },
  {
    id: 'r2',
    username: 'postmalone',
    displayName: 'Post Malone',
    avatarUrl: 'https://i.pravatar.cc/96?img=12',
    mutualFriends: 3,
  },
  {
    id: 'r3',
    username: 'rosalia',
    displayName: 'ROSALÍA',
    avatarUrl: 'https://i.pravatar.cc/96?img=22',
    mutualFriends: 5,
    note: 'Collaborating on the summer show lineup—let’s team up!',
  },
];

export const MOCK_SENT_INVITES: SentInvite[] = [
  {
    id: 'i1',
    email: 'sza@ctrl.world',
    sentAgo: '3d ago',
    status: 'pending',
  },
  {
    id: 'i2',
    email: 'beyonce@renaissance.tour',
    sentAgo: '5d ago',
    status: 'accepted',
  },
  {
    id: 'i3',
    email: 'frank.ocean@blonded.co',
    sentAgo: '1w ago',
    status: 'expired',
  },
];

export const MOCK_SUGGESTED_FRIENDS: SuggestedFriend[] = [
  {
    id: 's1',
    username: 'badgalriri',
    displayName: 'Rihanna',
    avatarUrl: 'https://i.pravatar.cc/96?img=47',
    mutualFriends: 12,
    reason: 'Works with three of your collaborators',
  },
  {
    id: 's2',
    username: 'theweeknd',
    displayName: 'The Weeknd',
    avatarUrl: 'https://i.pravatar.cc/96?img=14',
    mutualFriends: 6,
    reason: 'Recently joined your “Mix Lab” workspace',
  },
  {
    id: 's3',
    username: 'dojacat',
    displayName: 'Doja Cat',
    avatarUrl: 'https://i.pravatar.cc/96?img=27',
    mutualFriends: 4,
    reason: 'Trending in the Creator community this week',
  },
];

export const MOCK_DISCOVERY_PROFILES: DiscoveryProfile[] = [
  {
    id: 'd1',
    username: 'mxsunset',
    displayName: 'Maya Sunset',
    avatarUrl: 'https://i.pravatar.cc/96?img=37',
    mutualFriends: 9,
    highlight: 'Produces immersive live visuals for touring artists.',
    role: 'Visual Artist',
  },
  {
    id: 'd2',
    username: 'samplepackking',
    displayName: 'Leo Fowler',
    avatarUrl: 'https://i.pravatar.cc/96?img=31',
    mutualFriends: 4,
    highlight: 'Shares weekly sound kits and behind-the-scenes breakdowns.',
    role: 'Producer • Sound Designer',
  },
  {
    id: 'd3',
    username: 'tourmoments',
    displayName: 'Aria Bell',
    avatarUrl: 'https://i.pravatar.cc/96?img=53',
    mutualFriends: 6,
    highlight: 'Documented six global tours in the last year.',
    role: 'Documentary Filmmaker',
  },
  {
    id: 'd4',
    username: 'loopalchemy',
    displayName: 'Nikhil Rao',
    avatarUrl: 'https://i.pravatar.cc/96?img=9',
    mutualFriends: 2,
    highlight: 'Hosts collaborative jam sessions every Thursday night.',
    role: 'Multi-instrumentalist',
  },
];
