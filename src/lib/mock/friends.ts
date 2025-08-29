export type Friend = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string;
  hasRing?: boolean;   // show gradient ring like IG story
  isOnline?: boolean;
};

export const MOCK_FRIENDS: Friend[] = [
  {
    id: 'u1',
    username: 'drake',
    displayName: 'Drake',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/9/90/Drake_at_Sound_Academy_Toronto_Canada_2016-03-14.jpg/160px-Drake_at_Sound_Academy_Toronto_Canada_2016-03-14.jpg',
    hasRing: true,
  },
  {
    id: 'u2',
    username: 'kendrick_lamar',
    displayName: 'Kendrick Lamar',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0c/Kendrick_Lamar_Lollapalooza_2016-2.jpg/160px-Kendrick_Lamar_Lollapalooza_2016-2.jpg',
  },
  {
    id: 'u3',
    username: 'nicki_minaj',
    displayName: 'Nicki Minaj',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7c/Nicki_Minaj_NBC_2022.jpg/160px-Nicki_Minaj_NBC_2022.jpg',
    hasRing: true,
  },
  {
    id: 'u4',
    username: 'jayz',
    displayName: 'Jay-Z',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f7/Jay-Z_2011.jpg/160px-Jay-Z_2011.jpg',
    hasRing: true,
  },
  {
    id: 'u5',
    username: 'jcole',
    displayName: 'J. Cole',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/0/02/J._Cole_2018.jpg/160px-J._Cole_2018.jpg',
  },
  {
    id: 'u6',
    username: 'snoopdogg',
    displayName: 'Snoop Dogg',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/Snoop_Dogg_2019_by_Glenn_Francis.jpg/160px-Snoop_Dogg_2019_by_Glenn_Francis.jpg',
  },
  {
    id: 'u7',
    username: 'kanyewest',
    displayName: 'Kanye West',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Kanye_West_at_the_2009_Tribeca_Film_Festival.jpg/160px-Kanye_West_at_the_2009_Tribeca_Film_Festival.jpg',
  },
  {
    id: 'u8',
    username: 'eminem',
    displayName: 'Eminem',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Eminem@Dublin.jpg/160px-Eminem@Dublin.jpg',
  },
  {
    id: 'u9',
    username: 'cardib',
    displayName: 'Cardi B',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f3/Cardi_B_2018.jpg/160px-Cardi_B_2018.jpg',
  },
  {
    id: 'u10',
    username: 'travisscott',
    displayName: 'Travis Scott',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6d/Travis_Scott_August_2019.jpg/160px-Travis_Scott_August_2019.jpg',
  },
  {
    id: 'u11',
    username: 'lilwayne',
    displayName: 'Lil Wayne',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/Lil_Wayne_2011.jpg/160px-Lil_Wayne_2011.jpg',
    hasRing: true,
  },
  {
    id: 'u12',
    username: 'asaprocky',
    displayName: 'A$AP Rocky',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/37/ASAP_Rocky_2013.jpg/160px-ASAP_Rocky_2013.jpg',
  },
  {
    id: 'u13',
    username: '50cent',
    displayName: '50 Cent',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/3/3b/50_Cent_2018.jpg/160px-50_Cent_2018.jpg',
  },
  {
    id: 'u14',
    username: 'icecube',
    displayName: 'Ice Cube',
    avatarUrl:
      'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a7/Ice_Cube_2014.jpg/160px-Ice_Cube_2014.jpg',
  },
];
