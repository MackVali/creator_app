# Universal Social Poster guide

The Universal Social Poster lets you capture your social post content once and automatically syndicate it to every integration you have connected.

## Before you start

1. Open **Source** in the dashboard (`/source`).
2. Connect the social APIs you want to post to under **Connect an integration**. Either paste custom credentials or choose the **Universal social poster** preset and fill in the requested fields. Saved integrations must stay in the "active" state to receive posts.
3. Make sure the integration's request template includes the `social` keys if you need the caption, media, link, platforms, or hashtags. Templates can reference values such as `{{social.caption}}` or iterate `{{#each social.media}}` (see examples below).

## Create a listing with social content

1. Scroll to **Publish listing**.
2. Fill out the listing basics (type, title, description, price).
3. Under **Media & social**, add any images or videos you want to syndicate in **Media URLs**. Provide absolute links separated by new lines.
4. Add a **Caption** and optional **Call-to-action link**. If the caption is blank the description automatically fills in for you.
5. Use **Social networks** to list the default destinations, for example `snapchat, facebook, instagram`. This populates the social context that the integration receives.
6. Add hashtags either with or without the `#` prefix. The system normalizes them before pushing to your integrations.

When you choose **Publish now**, the listing is queued to every active integration. Each integration receives a request body that includes:

```json
{
  "listing": { "id": "...", "title": "..." },
  "integration": { "provider": "..." },
  "social": {
    "caption": "...",
    "link": "https://...",
    "media": [
      { "url": "https://...", "type": "image" }
    ],
    "platforms": ["snapchat", "facebook", "instagram"],
    "hashtags": ["summerdrop", "newin"]
  }
}
```

You can customize the payload per integration by saving a JSON template in the integration configuration. Use social tokens such as `{{social.caption}}`, `{{#each social.media}}`, `{{social.link}}`, or `{{social.hashtags}}`.

## Verify delivery

After publishing, check the **Delivery log** in Source. Each integration logs its status (`synced` or `failed`) with the HTTP response code and any error message to help you troubleshoot mismatched credentials or payloads.

## Tips

- Leave **Publish now** unchecked to save drafts with the social metadata for later.
- If you need to target different networks with different payloads, create multiple integrations and filter platforms in your template logic.
- OAuth integrations automatically refresh tokens when possible, so you do not have to re-authenticate before every post.
