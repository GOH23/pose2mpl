"use client"

import React, { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import { Locale, getLocale, setLocale, t } from './config'

export const LocaleContext = createContext({
    addMessage: (content: ReactNode, type: 'info' | 'success' | 'warning' | 'error', duration?: number) => { },
    locale: getLocale() as Locale,
    setLocale: (l: Locale) => { }
})

export function LocaleProvider({ children }: { children: React.ReactNode }) {
    const [messages, setMessages] = useState<Array<{
        id: string;
        content: ReactNode;
        type: 'info' | 'success' | 'warning' | 'error';
        visible: boolean;
        duration?: number;
    }>>([]);
    const generateId = () => Math.random().toString(36).substr(2, 9);

    const addMessage = (content: ReactNode, type: 'info' | 'success' | 'warning' | 'error', duration: number = 3000): void => {
        const id = generateId();
        const newMessage = { id, content, type, visible: true, duration };

        setMessages(prev => [...prev, newMessage]);

        setTimeout(() => {
            setMessages(prev => prev.map(msg =>
                msg.id === id ? { ...msg, visible: false } : msg
            ));

            setTimeout(() => {
                setMessages(prev => prev.filter(msg => msg.id !== id));
            }, 300);
        }, duration);
    };

    const escapeHtml = (unsafe: string) => {
        return unsafe
            .replace(/&/g, "&amp;")
            .replace(/</g, "<")
            .replace(/>/g, ">")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#039;");
    };
    const [locale, _setLocale] = useState<Locale>(getLocale() as Locale)
    const update = (l: Locale) => {
        setLocale(l)
        _setLocale(l)
    }
    return (
        <LocaleContext.Provider value={{ locale, setLocale: update, addMessage: addMessage }}>
            {children}
        </LocaleContext.Provider>
    )
}

export function useLocale() {
    return useContext(LocaleContext)
}
export function useTranslation() {
    const { locale } = useLocale()
    const translate = useCallback((key: string, fallback?: string) => {
        return t(key, fallback)
    }, [locale])
    return translate
}