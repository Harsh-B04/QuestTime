import React from 'react';
import {
  Brain,
  Code2,
  BookOpen,
  Dumbbell,
  Sparkles,
  Clock,
  Flame,
  Trophy,
  Zap,
  Sunrise,
  Star,
  Target,
  Coffee,
  Laptop,
  Music,
  Heart,
  Briefcase,
  Layers,
  type LucideProps,
} from 'lucide-react';

const iconMap: Record<string, React.FC<LucideProps>> = {
  Brain,
  Code2,
  BookOpen,
  Dumbbell,
  Sparkles,
  Clock,
  Flame,
  Trophy,
  Zap,
  Sunrise,
  Star,
  Target,
  Coffee,
  Laptop,
  Music,
  Heart,
  Briefcase,
  Layers,
};

interface CategoryIconProps extends LucideProps {
  name: string;
}

export const CategoryIcon: React.FC<CategoryIconProps> = ({ name, ...props }) => {
  const IconComponent = iconMap[name] || Clock;
  return <IconComponent {...props} />;
};

export const AVAILABLE_ICONS = Object.keys(iconMap);
