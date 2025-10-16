import { 
  Flower, 
  Feather, 
  Utensils, 
  MessageCircle, 
  Diamond, 
  Dumbbell, 
  BookOpen, 
  Film, 
  Briefcase 
} from 'lucide-react'

export const scheduleIcons = {
  lotus: Flower,
  feather: Feather,
  fork: Utensils,
  chat: MessageCircle,
  diamond: Diamond,
  dumbbell: Dumbbell,
  book: BookOpen,
  film: Film,
  work: Briefcase
} as const

export type ScheduleIconName = keyof typeof scheduleIcons
