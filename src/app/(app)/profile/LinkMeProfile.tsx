"use client";

import { useState } from "react";
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
  ArrowLeft
} from "lucide-react";
import { Profile } from "@/lib/types";

interface LinkMeProfileProps {
  profile: Profile;
}

interface SocialLink {
  platform: string;
  icon: React.ReactNode;
  url: string;
  color: string;
}

export default function LinkMeProfile({ profile }: LinkMeProfileProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Mock social links - in a real app, these would come from the profile
  const socialLinks: SocialLink[] = [
    { platform: "Instagram", icon: <Instagram className="h-5 w-5" />, url: "#", color: "bg-gradient-to-r from-purple-500 to-pink-500" },
    { platform: "Facebook", icon: <Facebook className="h-5 w-5" />, url: "#", color: "bg-blue-600" },
    { platform: "X", icon: <Twitter className="h-5 w-5" />, url: "#", color: "bg-black" },
    { platform: "LinkedIn", icon: <Linkedin className="h-5 w-5" />, url: "#", color: "bg-blue-700" },
    { platform: "YouTube", icon: <Youtube className="h-5 w-5" />, url: "#", color: "bg-red-600" },
    { platform: "TikTok", icon: <Music className="h-5 w-5" />, url: "#", color: "bg-black" },
    { platform: "Email", icon: <Mail className="h-5 w-5" />, url: "#", color: "bg-gray-600" },
  ];

  // Mock content links - in a real app, these would come from the profile
  const contentLinks = [
    {
      id: 1,
      title: "Website",
      description: "Visit my personal website",
      image: "/api/placeholder/300/200",
      url: "#",
      category: "Personal"
    },
    {
      id: 2,
      title: "Portfolio",
      description: "View my work and projects",
      image: "/api/placeholder/300/200",
      url: "#",
      category: "Work"
    },
    {
      id: 3,
      title: "Blog",
      description: "Read my latest thoughts and insights",
      image: "/api/placeholder/300/200",
      url: "#",
      category: "Content"
    },
    {
      id: 4,
      title: "Contact",
      description: "Get in touch with me",
      image: "/api/placeholder/300/200",
      url: "#",
      category: "Contact"
    }
  ];

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
          <div className="relative h-48 bg-gradient-to-br from-blue-600 to-purple-700">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-black/20" />
            <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
            
            {/* Profile Info Overlay */}
            <div className="absolute bottom-4 left-4 right-4 text-white">
              <div className="flex items-center space-x-2 mb-2">
                <h1 className="text-2xl font-bold">{profile.name || "Your Name"}</h1>
                <div className="w-5 h-5 bg-blue-500 rounded-full flex items-center justify-center">
                  <span className="text-xs font-bold text-white">✓</span>
                </div>
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
              {socialLinks.map((link) => (
                <a
                  key={link.platform}
                  href={link.url}
                  className={`w-12 h-12 ${link.color} rounded-full flex items-center justify-center text-white hover:scale-110 transition-transform duration-200 shadow-lg`}
                  title={link.platform}
                >
                  {link.icon}
                </a>
              ))}
            </div>

            {/* Content Links Grid */}
            <div className="space-y-4">
              {contentLinks.map((item) => (
                <a
                  key={item.id}
                  href={item.url}
                  className="block group"
                >
                  <div className="relative overflow-hidden rounded-lg border border-gray-200 hover:border-blue-300 transition-all duration-200 hover:shadow-lg">
                    <div className="aspect-video bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center">
                      <div className="text-center">
                        <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-2">
                          <ExternalLink className="h-8 w-8 text-blue-600" />
                        </div>
                        <p className="text-sm text-gray-500">{item.category}</p>
                      </div>
                    </div>
                    <div className="p-4">
                      <h3 className="font-semibold text-gray-900 group-hover:text-blue-600 transition-colors">
                        {item.title}
                      </h3>
                      <p className="text-sm text-gray-600 mt-1">
                        {item.description}
                      </p>
                    </div>
                  </div>
                </a>
              ))}
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
