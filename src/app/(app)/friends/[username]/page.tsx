import { redirect } from "next/navigation";

interface PageParams {
  params: { username: string };
}

export default function FriendsLegacyRedirect({ params }: PageParams) {
  const decodedUsername = (() => {
    try {
      return decodeURIComponent(params.username);
    } catch {
      return params.username;
    }
  })();

  redirect(`/profile/${encodeURIComponent(decodedUsername)}`);
}
