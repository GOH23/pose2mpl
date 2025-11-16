import { ReactNode } from "react";

interface ButtonProps {
  type?: 'primary' | 'secondary' | 'success' | 'warning' | 'error' | 'glass';
  children: ReactNode;
  onClick?: () => void;
  disabled?: boolean;
  icon?: ReactNode;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  variant?: 'solid' | 'outline' | 'ghost';
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
  // Стили для светлой темы
  const lightPrimary = variant === 'solid' ? 'bg-blue-600 hover:bg-blue-700 text-white' : 
                      variant === 'outline' ? 'border border-blue-600 text-blue-600 hover:bg-blue-50' : 
                      'text-blue-600 hover:bg-blue-50';
  
  const lightSecondary = variant === 'solid' ? 'bg-gray-600 hover:bg-gray-700 text-white' : 
                        variant === 'outline' ? 'border border-gray-600 text-gray-600 hover:bg-gray-50' : 
                        'text-gray-600 hover:bg-gray-50';
  
  const lightSuccess = variant === 'solid' ? 'bg-green-600 hover:bg-green-700 text-white' : 
                      variant === 'outline' ? 'border border-green-600 text-green-600 hover:bg-green-50' : 
                      'text-green-600 hover:bg-green-50';
  
  const lightWarning = variant === 'solid' ? 'bg-yellow-600 hover:bg-yellow-700 text-white' : 
                      variant === 'outline' ? 'border border-yellow-600 text-yellow-600 hover:bg-yellow-50' : 
                      'text-yellow-600 hover:bg-yellow-50';
  
  const lightError = variant === 'solid' ? 'bg-red-600 hover:bg-red-700 text-white' : 
                    variant === 'outline' ? 'border border-red-600 text-red-600 hover:bg-red-50' : 
                    'text-red-600 hover:bg-red-50';

  // Стили для темной темы (Glass UI)
  const darkPrimary = variant === 'solid' ? 'bg-blue-500/20 hover:bg-blue-500/30 text-blue-200 border-blue-400/50' : 
                     variant === 'outline' ? 'border border-blue-400/50 text-blue-200 hover:bg-blue-500/20' : 
                     'text-blue-200 hover:bg-blue-500/10';
  
  const darkSecondary = variant === 'solid' ? 'bg-gray-500/20 hover:bg-gray-500/30 text-gray-200 border-gray-400/50' : 
                       variant === 'outline' ? 'border border-gray-400/50 text-gray-200 hover:bg-gray-500/20' : 
                       'text-gray-200 hover:bg-gray-500/10';
  
  const darkSuccess = variant === 'solid' ? 'bg-green-500/20 hover:bg-green-500/30 text-green-200 border-green-400/50' : 
                     variant === 'outline' ? 'border border-green-400/50 text-green-200 hover:bg-green-500/20' : 
                     'text-green-200 hover:bg-green-500/10';
  
  const darkWarning = variant === 'solid' ? 'bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-200 border-yellow-400/50' : 
                     variant === 'outline' ? 'border border-yellow-400/50 text-yellow-200 hover:bg-yellow-500/20' : 
                     'text-yellow-200 hover:bg-yellow-500/10';
  
  const darkError = variant === 'solid' ? 'bg-red-500/20 hover:bg-red-500/30 text-red-200 border-red-400/50' : 
                   variant === 'outline' ? 'border border-red-400/50 text-red-200 hover:bg-red-500/20' : 
                   'text-red-200 hover:bg-red-500/10';

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-1.5 text-base',
    lg: 'px-4 py-2 text-lg'
  };

  // Определение стилей в зависимости от типа и темы
  const getButtonStyles = () => {
    const baseStyles = `
      relative rounded-lg font-medium transition-all duration-300
      ${sizeClasses[size]}
      ${disabled ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer hover:shadow-md'}
      ${className}
      overflow-hidden
    `;

    const glassBase = variant === 'solid' ? 'backdrop-blur-sm' : '';
    const borderBase = variant === 'outline' ? 'border' : '';
    const borderHover = variant === 'outline' && !disabled ? 'hover:border-blue-500' : '';

    switch (type) {
      case 'primary':
        return `${baseStyles} ${glassBase} ${borderBase} ${borderHover} 
                dark:${darkPrimary} ${lightPrimary}`;
      case 'secondary':
        return `${baseStyles} ${glassBase} ${borderBase} ${borderHover}
                dark:${darkSecondary} ${lightSecondary}`;
      case 'success':
        return `${baseStyles} ${glassBase} ${borderBase} ${borderHover}
                dark:${darkSuccess} ${lightSuccess}`;
      case 'warning':
        return `${baseStyles} ${glassBase} ${borderBase} ${borderHover}
                dark:${darkWarning} ${lightWarning}`;
      case 'error':
        return `${baseStyles} ${glassBase} ${borderBase} ${borderHover}
                dark:${darkError} ${lightError}`;
      case 'glass':
        return `${baseStyles} ${glassBase} border border-white/20 text-white hover:bg-white/20
                dark:bg-white/10 dark:hover:bg-white/20 bg-gray-100 hover:bg-gray-200 text-gray-800`;
      default:
        return `${baseStyles} ${glassBase} ${borderBase} ${borderHover}
                dark:${darkPrimary} ${lightPrimary}`;
    }
  };

  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={getButtonStyles()}
    >
      <div className="absolute inset-0 bg-gradient-to-r from-white/5 to-transparent opacity-0 hover:opacity-100 transition-opacity dark:block hidden" />
      <div className="relative flex items-center justify-center">
        {icon && <span className="mr-2">{icon}</span>}
        {children}
      </div>
    </button>
  );
};