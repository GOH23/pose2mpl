import { useState, ReactNode } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';

interface CollapseItem {
  key: string;
  label: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  showArrow?: boolean;
  disabled?: boolean;
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}

interface CollapseProps {
  activeKey?: string[];
  defaultActiveKey?: string[];
  onChange?: (keys: string[]) => void;
  accordion?: boolean;
  ghost?: boolean;
  expandIcon?: (panelProps: { isActive: boolean }) => ReactNode;
  expandIconPosition?: 'left' | 'right';
  className?: string;
  items?: CollapseItem[];
  children?: ReactNode;
}

const Panel = ({
  header,
  children,
  extra,
  showArrow = true,
  isActive,
  onClick,
  disabled,
  expandIcon,
  expandIconPosition = 'right',
  className = '',
  headerClassName = '',
  contentClassName = '',
}: {
  header: ReactNode;
  children: ReactNode;
  extra?: ReactNode;
  showArrow?: boolean;
  isActive: boolean;
  onClick: () => void;
  disabled?: boolean;
  expandIcon?: (panelProps: { isActive: boolean }) => ReactNode;
  expandIconPosition?: 'left' | 'right';
  className?: string;
  headerClassName?: string;
  contentClassName?: string;
}) => {
  const renderExpandIcon = () => {
    if (expandIcon) {
      return expandIcon({ isActive });
    }
    
    return (
      <div className="text-gray-500 dark:text-gray-400 transition-transform duration-300">
        {isActive ? (
          <ChevronUp size={16} className="text-blue-500 dark:text-blue-400" />
        ) : (
          <ChevronDown size={16} />
        )}
      </div>
    );
  };

  return (
    <div className={`border-b border-gray-200 dark:border-gray-700 last:border-b-0 ${className}`}>
      <div 
        className={`
          flex items-center justify-between p-4 cursor-pointer
          ${disabled ? 'cursor-not-allowed opacity-50' : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'}
          transition-all duration-300
          ${isActive ? 'bg-gray-50 dark:bg-gray-800/50' : ''}
          ${headerClassName}
        `}
        onClick={() => !disabled && onClick()}
      >
        <div className="flex items-center flex-1 min-w-0">
          {expandIconPosition === 'left' && showArrow && (
            <div className="mr-3 flex-shrink-0">{renderExpandIcon()}</div>
          )}
          <div className="font-medium text-gray-800 dark:text-gray-200 truncate">
            {header}
          </div>
          {expandIconPosition === 'right' && showArrow && (
            <div className="ml-3 flex-shrink-0">{renderExpandIcon()}</div>
          )}
        </div>
        {extra && <div className="ml-4 flex-shrink-0">{extra}</div>}
      </div>
      <div 
        className={`
          overflow-hidden transition-all duration-300 ease-in-out
          ${isActive 
            ? 'max-h-[1000px] opacity-100 py-4' 
            : 'max-h-0 opacity-0 py-0'
          }
          ${contentClassName}
        `}
      >
        <div className="px-4 pr-6">
          {children}
        </div>
      </div>
    </div>
  );
};

export const Collapse = ({
  activeKey: controlledActiveKey,
  defaultActiveKey = [],
  onChange,
  accordion = false,
  ghost = false,
  expandIcon,
  expandIconPosition = 'right',
  className = '',
  items,
  children,
}: CollapseProps) => {
  const [internalActiveKey, setInternalActiveKey] = useState<string[]>(defaultActiveKey);
  const isControlled = controlledActiveKey !== undefined;
  const activeKeys = isControlled ? controlledActiveKey : internalActiveKey;

  const handlePanelClick = (key: string) => {
    let newKeys: string[];

    if (accordion) {
      newKeys = activeKeys.includes(key) ? [] : [key];
    } else {
      newKeys = activeKeys.includes(key)
        ? activeKeys.filter(k => k !== key)
        : [...activeKeys, key];
    }

    if (!isControlled) {
      setInternalActiveKey(newKeys);
    }
    
    if (onChange) {
      onChange(newKeys);
    }
  };

  const renderPanels = () => {
    if (items) {
      return items.map((item) => (
        <Panel
          key={item.key}
          header={item.label}
          children={item.children}
          extra={item.extra}
          showArrow={item.showArrow}
          isActive={activeKeys.includes(item.key)}
          onClick={() => handlePanelClick(item.key)}
          disabled={item.disabled}
          expandIcon={expandIcon}
          expandIconPosition={expandIconPosition}
          className={item.className}
          headerClassName={item.headerClassName}
          contentClassName={item.contentClassName}
        />
      ));
    }

    return children;
  };

  return (
    <div className={`${ghost ? '' : 'border rounded-lg'} border-gray-200 dark:border-gray-700 ${className}`}>
      {renderPanels()}
    </div>
  );
};

export default Collapse;