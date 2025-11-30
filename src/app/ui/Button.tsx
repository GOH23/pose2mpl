import { ReactNode } from "react";

interface ButtonProps {
  type?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'glass' | 'info' | 'dark' | 'light';
  children: ReactNode;
  onClick?: (e: any) => void;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'solid' | 'outline' | 'ghost' | 'link';
}

export const Button = ({
  type = 'primary',
  children,
  onClick,
  disabled = false,
  icon,
  className = '',
  size = 'md',
  variant = 'solid'
}: ButtonProps) => {
  // Базовые классы для всех кнопок
  const baseClasses = `
    relative rounded-lg font-medium transition-all duration-300
    focus:outline-none focus:ring-2 focus:ring-offset-2
    disabled:opacity-50 disabled:cursor-not-allowed
    flex items-center justify-center gap-2
    ${className}
  `;

  // Классы размеров
  const sizeClasses = {
    sm: 'px-3 py-1.5 text-sm',
    md: 'px-4 py-2 text-base',
    lg: 'px-6 py-3 text-lg',
    xl: 'px-8 py-4 text-xl'
  };

  // Стили для светлой темы
  const getLightStyles = () => { 
    const base = {
      primary: {
        solid: 'bg-blue-600 hover:bg-blue-700 text-white focus:ring-blue-500',
        outline: 'border border-blue-600 text-blue-600 hover:bg-blue-50 focus:ring-blue-500',
        ghost: 'text-blue-600 hover:bg-blue-50 focus:ring-blue-500',
        link: 'text-blue-600 hover:text-blue-700 underline focus:ring-blue-500'
      },
      secondary: {
        solid: 'bg-gray-600 hover:bg-gray-700 text-white focus:ring-gray-500',
        outline: 'border border-gray-600 text-gray-600 hover:bg-gray-50 focus:ring-gray-500',
        ghost: 'text-gray-600 hover:bg-gray-50 focus:ring-gray-500',
        link: 'text-gray-600 hover:text-gray-700 underline focus:ring-gray-500' 
      },
      success: { 
        solid: 'bg-green-600 hover:bg-green-700 text-white focus:ring-green-500',
        outline: 'border border-green-600 text-green-600 hover:bg-green-50 focus:ring-green-500',
        ghost: 'text-green-600 hover:bg-green-50 focus:ring-green-500',
        link: 'text-green-600 hover:text-green-700 underline focus:ring-green-500'
      }, 
      warning: {
        solid: 'bg-yellow-500 hover:bg-yellow-600 text-white focus:ring-yellow-500',
        outline: 'border border-yellow-500 text-yellow-600 hover:bg-yellow-50 focus:ring-yellow-500',
        ghost: 'text-yellow-600 hover:bg-yellow-50 focus:ring-yellow-500',
        link: 'text-yellow-600 hover:text-yellow-700 underline focus:ring-yellow-500'
      },
      error: {
        solid: 'bg-red-600 hover:bg-red-700 text-white focus:ring-red-500',
        outline: 'border border-red-600 text-red-600 hover:bg-red-50 focus:ring-red-500',
        ghost: 'text-red-600 hover:bg-red-50 focus:ring-red-500',
        link: 'text-red-600 hover:text-red-700 underline focus:ring-red-500'
      },
      info: {
        solid: 'bg-cyan-500 hover:bg-cyan-600 text-white focus:ring-cyan-500',
        outline: 'border border-cyan-500 text-cyan-600 hover:bg-cyan-50 focus:ring-cyan-500',
        ghost: 'text-cyan-600 hover:bg-cyan-50 focus:ring-cyan-500',
        link: 'text-cyan-600 hover:text-cyan-700 underline focus:ring-cyan-500'
      },
      dark: {
        solid: 'bg-gray-800 hover:bg-gray-900 text-white focus:ring-gray-500',
        outline: 'border border-gray-800 text-gray-800 hover:bg-gray-50 focus:ring-gray-500',
        ghost: 'text-gray-800 hover:bg-gray-50 focus:ring-gray-500',
        link: 'text-gray-800 hover:text-gray-900 underline focus:ring-gray-500'
      },
      light: {
        solid: 'bg-gray-100 hover:bg-gray-200 text-gray-800 focus:ring-gray-300',
        outline: 'border border-gray-300 text-gray-700 hover:bg-gray-50 focus:ring-gray-300',
        ghost: 'text-gray-700 hover:bg-gray-50 focus:ring-gray-300',
        link: 'text-gray-600 hover:text-gray-800 underline focus:ring-gray-300'
      },
      glass: {
        solid: 'backdrop-blur-sm bg-white/20 hover:bg-white/30 text-white border border-white/30 focus:ring-white/50',
        outline: 'backdrop-blur-sm border border-white/50 text-white hover:bg-white/20 focus:ring-white/50',
        ghost: 'backdrop-blur-sm text-white hover:bg-white/20 focus:ring-white/50',
        link: 'backdrop-blur-sm text-white underline hover:text-white/80 focus:ring-white/50'
      }
    };

    return base[type]?.[variant] || base.primary.solid;
  };

  // Стили для темной темы
  const getDarkStyles = () => {
    const base = {
      primary: {
        solid: 'dark:bg-blue-500 dark:hover:bg-blue-600 dark:text-white dark:focus:ring-blue-400',
        outline: 'dark:border dark:border-blue-400 dark:text-blue-400 dark:hover:bg-blue-500/20 dark:focus:ring-blue-400',
        ghost: 'dark:text-blue-400 dark:hover:bg-blue-500/20 dark:focus:ring-blue-400',
        link: 'dark:text-blue-400 dark:hover:text-blue-300 dark:underline dark:focus:ring-blue-400'
      },
      secondary: {
        solid: 'dark:bg-gray-500 dark:hover:bg-gray-600 dark:text-white dark:focus:ring-gray-400',
        outline: 'dark:border dark:border-gray-400 dark:text-gray-400 dark:hover:bg-gray-500/20 dark:focus:ring-gray-400',
        ghost: 'dark:text-gray-400 dark:hover:bg-gray-500/20 dark:focus:ring-gray-400',
        link: 'dark:text-gray-400 dark:hover:text-gray-300 dark:underline dark:focus:ring-gray-400'
      },
      success: {
        solid: 'dark:bg-green-500 dark:hover:bg-green-600 dark:text-white dark:focus:ring-green-400',
        outline: 'dark:border dark:border-green-400 dark:text-green-400 dark:hover:bg-green-500/20 dark:focus:ring-green-400',
        ghost: 'dark:text-green-400 dark:hover:bg-green-500/20 dark:focus:ring-green-400',
        link: 'dark:text-green-400 dark:hover:text-green-300 dark:underline dark:focus:ring-green-400'
      },
      warning: {
        solid: 'dark:bg-yellow-500 dark:hover:bg-yellow-600 dark:text-white dark:focus:ring-yellow-400',
        outline: 'dark:border dark:border-yellow-400 dark:text-yellow-400 dark:hover:bg-yellow-500/20 dark:focus:ring-yellow-400',
        ghost: 'dark:text-yellow-400 dark:hover:bg-yellow-500/20 dark:focus:ring-yellow-400',
        link: 'dark:text-yellow-400 dark:hover:text-yellow-300 dark:underline dark:focus:ring-yellow-400'
      },
      error: {
        solid: 'dark:bg-red-500 dark:hover:bg-red-600 dark:text-white dark:focus:ring-red-400',
        outline: 'dark:border dark:border-red-400 dark:text-red-400 dark:hover:bg-red-500/20 dark:focus:ring-red-400',
        ghost: 'dark:text-red-400 dark:hover:bg-red-500/20 dark:focus:ring-red-400',
        link: 'dark:text-red-400 dark:hover:text-red-300 dark:underline dark:focus:ring-red-400'
      },
      info: {
        solid: 'dark:bg-cyan-500 dark:hover:bg-cyan-600 dark:text-white dark:focus:ring-cyan-400',
        outline: 'dark:border dark:border-cyan-400 dark:text-cyan-400 dark:hover:bg-cyan-500/20 dark:focus:ring-cyan-400',
        ghost: 'dark:text-cyan-400 dark:hover:bg-cyan-500/20 dark:focus:ring-cyan-400',
        link: 'dark:text-cyan-400 dark:hover:text-cyan-300 dark:underline dark:focus:ring-cyan-400'
      },
      dark: {
        solid: 'dark:bg-gray-700 dark:hover:bg-gray-800 dark:text-white dark:focus:ring-gray-600',
        outline: 'dark:border dark:border-gray-600 dark:text-gray-300 dark:hover:bg-gray-700/50 dark:focus:ring-gray-600',
        ghost: 'dark:text-gray-300 dark:hover:bg-gray-700/50 dark:focus:ring-gray-600',
        link: 'dark:text-gray-300 dark:hover:text-gray-200 dark:underline dark:focus:ring-gray-600'
      },
      light: {
        solid: 'dark:bg-gray-200 dark:hover:bg-gray-300 dark:text-gray-800 dark:focus:ring-gray-400',
        outline: 'dark:border dark:border-gray-400 dark:text-gray-300 dark:hover:bg-gray-200/20 dark:focus:ring-gray-400',
        ghost: 'dark:text-gray-300 dark:hover:bg-gray-200/20 dark:focus:ring-gray-400',
        link: 'dark:text-gray-300 dark:hover:text-gray-200 dark:underline dark:focus:ring-gray-400'
      },
      glass: {
        solid: 'dark:backdrop-blur-sm dark:bg-black/30 dark:hover:bg-black/40 dark:text-white dark:border dark:border-white/20 dark:focus:ring-white/50',
        outline: 'dark:backdrop-blur-sm dark:border dark:border-white/30 dark:text-white dark:hover:bg-black/30 dark:focus:ring-white/50',
        ghost: 'dark:backdrop-blur-sm dark:text-white dark:hover:bg-black/30 dark:focus:ring-white/50',
        link: 'dark:backdrop-blur-sm dark:text-white dark:underline dark:hover:text-white/80 dark:focus:ring-white/50'
      }
    };

    return base[type]?.[variant] || base.primary.solid;
  };

  // Дополнительные классы для разных вариантов
  const getVariantClasses = () => {
    switch (variant) {
      case 'outline':
        return 'border';
      case 'link':
        return 'bg-transparent border-none shadow-none';
      case 'ghost':
        return 'bg-transparent border-none';
      default:
        return '';
    }
  };

  // Собираем все классы вместе
  const buttonClasses = `
    ${baseClasses}
    ${sizeClasses[size]}
    ${getVariantClasses()}
    ${getLightStyles()}
    ${getDarkStyles()}
    ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
  `.replace(/\s+/g, ' ').trim();

  // Эффект градиента для кнопок (кроме link и ghost)
  const GradientOverlay = () => {
    if (variant === 'link' || variant === 'ghost') return null;
    
    return (
      <div className="absolute inset-0 bg-gradient-to-r from-white/10 to-transparent opacity-0 hover:opacity-100 transition-opacity duration-300 rounded-lg" />
    );
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={buttonClasses}
    >
      <GradientOverlay />
      <div className="relative flex items-center justify-center">
        {icon}
        {children}
      </div>
    </button>
  );
};