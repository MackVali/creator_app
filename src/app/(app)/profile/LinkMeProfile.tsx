"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Instagram, 
  Facebook, 
  Twitter, 
  Linkedin, 
  Youtube, 
  Music, 
  Mail, 
  MapPin, 
  Edit3,
  ExternalLink,
  Share2,
  Menu,
  ArrowLeft,
  Plus
} from "lucide-react";
import { Profile, SocialLink, ContentCard } from "@/lib/types";
import { getSocialLinks, getContentCards, getPlatformIcon, getPlatformColor } from "@/lib/db/profile-management";

interface LinkMeProfileProps {
  profile: Profile;
}

export default function LinkMeProfile({ profile }: LinkMeProfileProps) {
  const [socialLinks, setSocialLinks] = useState<SocialLink[]>([]);
  const [contentCards, setContentCards] = useState<ContentCard[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadProfileData() {
      if (!profile?.user_id) return;

      try {
        setLoading(true);
        const [links, cards] = await Promise.all([
          getSocialLinks(profile.user_id),
          getContentCards(profile.user_id)
        ]);
        
        setSocialLinks(links);
        setContentCards(cards);
      } catch (error) {
        console.error("Error loading profile data:", error);
      } finally {
        setLoading(false);
      }
    }

    loadProfileData();
  }, [profile?.user_id]);

  const getInitials = (name: string | null, username: string) => {
    if (name) {
      return name
        .split(" ")
        .map((word) => word.charAt(0))
        .join("")
        .toUpperCase()
        .slice(0, 2);
    }
    return username.slice(0, 2).toUpperCase();
  };

  const initials = getInitials(profile.name || null, profile.username);

  // Default content cards if none exist
  const defaultContentCards = [
    {
      id: "default-1",
      title: "Website",
      description: "Visit my personal website",
      url: "#",
      category: "Personal"
    },
    {
      id: "default-2", 
      title: "Portfolio",
      description: "View my work and projects",
      url: "#",
      category: "Work"
    },
    {
      id: "default-3",
      title: "Blog",
      description: "Read my latest thoughts and insights",
      url: "#",
      category: "Content"
    },
    {
      id: "default-4",
      title: "Contact",
      description: "Get in touch with me",
      url: "#",
      category: "Contact"
    }
  ];

  // Use real content cards or fall back to defaults
  const displayCards = contentCards.length > 0 ? contentCards : defaultContentCards;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-purple-50">
      {/* Top Navigation Bar */}
      <div className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-gray-200">
        <div className="flex items-center justify-between px-4 py-3">
          <div className="flex items-center space-x-3">
            <Link href="/dashboard">
              <Button variant="ghost" size="sm" className="p-2">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div className="flex items-center space-x-2">
              <span className="text-sm text-gray-600">Bio Link</span>
              <ExternalLink className="h-4 w-4 text-gray-400" />
            </div>
          </div>
          
          <div className="flex items-center space-x-2">
            <Button variant="ghost" size="sm" className="p-2">
              <Share2 className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="sm" className="p-2">
              <Menu className="h-5 w-5" />
            </Button>
          </div>
        </div>
      </div>

      {/* Main Profile Section */}
      <div className="max-w-md mx-auto px-4 py-6">
        <Card className="overflow-hidden shadow-xl border-0">
          {/* Background Image Section */}
          <div 
            className="relative h-48 bg-gradient-to-br from-blue-600 to-purple-700"
            style={{
              background: profile.banner_url 
                ? `linear-gradient(rgba(0,0,0,0.3), rgba(0,0,0,0.3)), url(${profile.banner_url})`
                : `linear-gradient(135deg, ${profile.theme_color || '#3B82F6'} 0%, ${profile.accent_color || '#8B5CF6'} 100%)`,
              backgroundSize: 'cover',
              backgroundPosition: 'center'
            }}
          >
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            
            {/* Profile Info Overlay */}
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <div className="flex items-center space-x-2 mb-2">
                <h1 className="text-2xl font-bold">{profile.name || "Your Name"}</h1>
                {profile.verified && (
                  <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                    <span className="text-xs font-bold text-white">✓</span>
                  </div>
                )}
              </div>
              <p className="text-lg opacity-90">@{profile.username}</p>
            </div>

            {/* Floating "me" Button */}
            <div className="absolute top-4 left-4">
              <Button 
                variant="secondary" 
                size="sm" 
                className="bg-white/20 text-white border-white/30 hover:bg-white/30 backdrop-blur-sm"
              >
                me
              </Button>
            </div>
          </div>

          {/* Profile Content */}
          <CardContent className="p-6">
            {/* Bio */}
            <div className="text-center mb-6">
              <p className="text-gray-700 text-lg leading-relaxed">
                {profile.bio || "Dad • Creator • Entrepreneur • Philanthropist"}
              </p>
            </div>

            {/* Location */}
            {profile.city && (
              <div className="flex items-center justify-center space-x-2 mb-6 text-gray-600">
                <MapPin className="h-4 w-4 text-red-500" />
                <span>{profile.city}</span>
              </div>
            )}

            {/* Social Media Links */}
            <div className="flex justify-center space-x-3 mb-8">
              {socialLinks.length > 0 ? (
                socialLinks.map((link) => (
                  <a
                    key={link.id}
                    href={link.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`w-12 h-12 ${link.color || getPlatformColor(link.platform)} rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform duration-200 shadow-lg`}
                    title={link.platform}
                  >
                    <span className="text-lg">{link.icon || getPlatformIcon(link.platform)}</span>
                  </a>
                ))
              ) : (
                // Default social icons if none exist
                [
                  { platform: "instagram", icon: "📷", color: "bg-gradient-to-r from-purple-500 to-pink-500" },
                  { platform: "facebook", icon: "📘", color: "bg-blue-600" },
                  { platform: "twitter", icon: "🐦", color: "bg-blue-400" },
                  { platform: "linkedin", icon: "💼", color: "bg-blue-700" },
                  { platform: "youtube", icon: "📺", color: "bg-red-600" },
                  { platform: "tiktok", icon: "🎵", color: "bg-black" },
                  { platform: "email", icon: "✉️", color: "bg-gray-600" },
                ].map((social) => (
                  <div
                    key={social.platform}
                    className={`w-12 h-12 ${social.color} rounded-full flex items-center justify-center text-white opacity-50`}
                    title={`Add ${social.platform}`}
                  >
                    <span className="text-lg">{social.icon}</span>
                  </div>
                ))
              )}
            </div>

            {/* Content Links Grid */}
            <div className="space-y-4">
              {displayCards.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block group"
                >
                  <div className="relative overflow-hidden rounded-lg border border-gray-200 hover:border-blue-300 transition-all duration-200 hover:shadow-lg">
                    {item.thumbnail_url ? (
                      <div className="aspect-video bg-cover bg-center" style={{ backgroundImage: `url(${item.thumbnail_url})` }} />
                    ) : (
                      <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                        <div className="text-center">
                          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                            <ExternalLink className="h-8 w-8 text-blue-600" />
                          </div>
                          <p className="text-sm text-gray-500">{item.category || "Link"}</p>
                        </div>
                      </div>
                    )}
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h3>
                      {item.description && (
                        <p className="text-sm text-gray-600 mt-1">
                          {item.description}
                        </p>
                      )}
                    </div>
                  </div>
                </a>
              ))}
            </div>

            {/* Add Content Button */}
            <div className="mt-6 text-center">
              <Link href="/profile/edit">
                <Button variant="outline" className="w-full border-dashed border-2 border-gray-300 hover:border-blue-400 hover:bg-blue-50">
                  <Plus className="h-5 w-5 mr-2" />
                  Add More Content
                </Button>
              </Link>
            </div>

            {/* Edit Profile Button */}
            <div className="mt-8 text-center">
              <Link href="/profile/edit">
                <Button className="bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white px-8 py-3 rounded-full shadow-lg hover:shadow-xl transition-all duration-200">
                  <Edit3 className="h-5 w-5 mr-2" />
                  Edit Profile
                </Button>
              </Link>
            </div>
          </CardContent>
        </Card>

        {/* Footer */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>Powered by Premium App</p>
        </div>
      </div>
    </div>
  );
}
