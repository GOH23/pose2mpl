"use client"

import { useTranslation } from "@/i18n/LocaleProvider"
import { Menu, X, Github, MessageCircle, BookOpen, Eye, Grid3x3 } from "lucide-react"
import Link from "next/link"
import { useState, useEffect } from "react"

export function Header() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false)
    const [scrolled, setScrolled] = useState(false)
    const tr = useTranslation()

    // Эффект для отслеживания скролла
    useEffect(() => {
        const handleScroll = () => {
            setScrolled(window.scrollY > 10)
        }
        window.addEventListener('scroll', handleScroll)
        return () => window.removeEventListener('scroll', handleScroll)
    }, [])

    // Закрыть мобильное меню при изменении размера экрана
    useEffect(() => {
        const handleResize = () => {
            if (window.innerWidth >= 768) {
                setIsMobileMenuOpen(false)
            }
        }
        window.addEventListener('resize', handleResize)
        return () => window.removeEventListener('resize', handleResize)
    }, [])

    return (
        <>
            <header className="w-full top-0 fixed z-50 transition-all duration-300">
                <div className={`mx-4 md:mx-6 mt-3 md:mt-4 border p-3 md:p-4 rounded-xl md:rounded-2xl transition-all duration-300 ${
                    scrolled 
                        ? 'bg-white/90 backdrop-blur-xl shadow-lg border-gray-300/50' 
                        : 'bg-white/80 backdrop-blur-lg border-gray-200/70'
                }`}>
                    <div className="flex items-center justify-between min-h-[45px] md:min-h-[50px]">
                        {/* Логотип и название */}
                        <div className="flex items-center gap-2 md:gap-3">
                            <div className="relative">
                                <img 
                                    src={"/photo_2025-11-23_14-19-08.jpg"} 
                                    className="shadow h-9 w-9 md:h-10 md:w-10 rounded-lg md:rounded-xl object-cover transition-transform hover:scale-105" 
                                    alt="Media2Mpl Logo"
                                />
                                <div className="absolute -inset-1 bg-linear-to-r from-blue-400 to-purple-400 rounded-lg md:rounded-xl -z-10 opacity-20 blur-sm"></div>
                            </div>
                            <Link 
                                href={"/"} 
                                className="text-lg md:text-xl font-bold bg-linear-to-r from-gray-800 to-gray-600 bg-clip-text text-transparent hover:opacity-90 transition-opacity"
                            >
                                Media2Mpl
                            </Link>
                        </div>

                        {/* Социальные иконки - скрыты на мобильных в меню */}
                        <div className="hidden md:flex items-center gap-2">
                            <Link 
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors group" 
                                target="_blank" 
                                href={"https://github.com"}
                                aria-label="GitHub"
                            >
                                <Github className="w-5 h-5 text-gray-700 group-hover:text-gray-900" />
                            </Link>
                            <Link 
                                className="p-2 rounded-lg hover:bg-gray-100 transition-colors group" 
                                target="_blank" 
                                href={"https://t.me"}
                                aria-label="Telegram"
                            >
                                <svg 
                                    className="w-5 h-5 text-gray-700 group-hover:text-gray-900" 
                                    viewBox="0 0 24 24" 
                                    fill="currentColor"
                                >
                                    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.06-.2-.07-.06-.17-.04-.24-.02-.1.02-1.79 1.12-5.06 3.31-.48.33-.91.49-1.3.48-.43-.01-1.27-.24-1.89-.44-.76-.24-1.36-.37-1.31-.78.03-.24.36-.48.99-.74 3.79-1.65 6.3-2.74 7.52-3.29 3.33-1.49 4.02-1.75 4.47-1.76.1 0 .32.02.46.14.12.1.16.23.18.33.01.1.02.32.01.5z" />
                                </svg>
                            </Link>
                        </div>

                        {/* Навигация - скрыта на мобильных */}
                        <nav className="hidden md:flex items-center gap-4 md:gap-6">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-semibold hover:bg-gray-100 px-3 py-2 rounded-lg transition-all cursor-pointer group"
                            >
                                <BookOpen className="w-4 h-4 group-hover:rotate-12 transition-transform" />
                                <span>Guide</span>
                            </button>
                            <Link 
                                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-semibold hover:bg-gray-100 px-3 py-2 rounded-lg transition-all" 
                                href={"/gallery"}
                            >
                                <Grid3x3 className="w-4 h-4" />
                                <span>Gallery</span>
                            </Link>
                            <Link 
                                className="flex items-center gap-2 text-gray-700 hover:text-gray-900 font-semibold hover:bg-gray-100 px-3 py-2 rounded-lg transition-all" 
                                href={"/engine_view"}
                            >
                                <Eye className="w-4 h-4" />
                                <span>View</span>
                            </Link>
                        </nav>

                        {/* Кнопка бургер-меню для мобильных */}
                        <button
                            onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                            className="md:hidden p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            aria-label="Toggle menu"
                        >
                            {isMobileMenuOpen ? (
                                <X className="w-6 h-6 text-gray-700" />
                            ) : (
                                <Menu className="w-6 h-6 text-gray-700" />
                            )}
                        </button>
                    </div>

                    {/* Мобильное меню */}
                    {isMobileMenuOpen && (
                        <div className="md:hidden mt-4 pt-4 border-t border-gray-200 animate-slideDown">
                            <div className="flex flex-col gap-3">
                                <div className="flex items-center gap-4 pb-3">
                                    <Link 
                                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors" 
                                        target="_blank" 
                                        href={"https://github.com"}
                                        aria-label="GitHub"
                                    >
                                        <Github className="w-5 h-5 text-gray-700" />
                                    </Link>
                                    <Link 
                                        className="p-2 rounded-lg hover:bg-gray-100 transition-colors" 
                                        target="_blank" 
                                        href={"https://t.me"}
                                        aria-label="Telegram"
                                    >
                                        <MessageCircle className="w-5 h-5 text-gray-700" />
                                    </Link>
                                </div>
                                
                                <button
                                    onClick={() => {
                                        setIsModalOpen(true)
                                        setIsMobileMenuOpen(false)
                                    }}
                                    className="flex items-center gap-3 text-left text-gray-700 hover:text-gray-900 font-semibold hover:bg-gray-100 px-4 py-3 rounded-lg transition-all cursor-pointer"
                                >
                                    <BookOpen className="w-5 h-5" />
                                    <span>Guide</span>
                                </button>
                                
                                <Link 
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 text-left text-gray-700 hover:text-gray-900 font-semibold hover:bg-gray-100 px-4 py-3 rounded-lg transition-all" 
                                    href={"/gallery"}
                                >
                                    <Grid3x3 className="w-5 h-5" />
                                    <span>Gallery</span>
                                </Link>
                                
                                <Link 
                                    onClick={() => setIsMobileMenuOpen(false)}
                                    className="flex items-center gap-3 text-left text-gray-700 hover:text-gray-900 font-semibold hover:bg-gray-100 px-4 py-3 rounded-lg transition-all" 
                                    href={"/engine_view"}
                                >
                                    <Eye className="w-5 h-5" />
                                    <span>View</span>
                                </Link>
                            </div>
                        </div>
                    )}
                </div>
            </header>

            {/* Модальное окно Guide */}
            {isModalOpen && (
                <div
                    className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm"
                    onClick={() => setIsModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="bg-white rounded-2xl max-w-4xl w-full max-h-[90vh] md:max-h-[85vh] overflow-y-auto shadow-2xl animate-scaleIn"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-5 md:p-8">
                            <div className="flex justify-between items-center mb-6 md:mb-8">
                                <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
                                    {tr("guide.title")}
                                </h2>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-gray-500 hover:text-gray-700 cursor-pointer w-10 h-10 flex items-center justify-center rounded-full hover:bg-gray-100 transition-colors"
                                    aria-label="Close"
                                >
                                    <X className="w-6 h-6" />
                                </button>
                            </div>

                            <div className="space-y-5 md:space-y-6 text-gray-800">
                                {/* Основной блок */}
                                <div className="bg-linear-to-r from-blue-50 to-blue-100/50 p-5 md:p-6 rounded-xl border border-blue-200">
                                    <h3 className="font-bold text-lg md:text-xl mb-3 text-gray-900">
                                        {tr("guide.howToUse1")}
                                    </h3>
                                    <p className="text-gray-700 leading-relaxed">
                                        {tr("guide.howToUse2")}
                                    </p>
                                </div>

                                {/* Инструкции */}
                                <div className="space-y-4 p-4 md:p-5 bg-gray-50 rounded-xl">
                                    <h4 className="font-semibold text-lg text-gray-900">
                                        {tr("guide.guide_instruction1.instruction1")}
                                    </h4>
                                    <ol className="space-y-3">
                                        {[
                                            tr("guide.guide_instruction1.instruction2"),
                                            tr("guide.guide_instruction1.instruction3"),
                                            tr("guide.guide_instruction1.instruction4"),
                                            tr("guide.guide_instruction1.instruction5")
                                        ].map((item, index) => (
                                            <li key={index} className="flex items-start gap-3">
                                                <div className="shrink-0 w-6 h-6 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">
                                                    {index + 1}
                                                </div>
                                                <span className="text-gray-700">{item}</span>
                                            </li>
                                        ))}
                                    </ol>
                                </div>

                                {/* Поддерживаемые форматы */}
                                <div className="bg-linear-to-r from-purple-50 to-pink-50 p-5 md:p-6 rounded-xl border border-purple-200">
                                    <h4 className="font-semibold text-lg mb-3 text-gray-900">
                                        {tr("guide.newFeatureTitle")}
                                    </h4>
                                    <p className="text-gray-700 mb-4">
                                        {tr("guide.newFeatureText")}
                                    </p>
                                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                                        <div className="bg-white/70 p-4 rounded-lg border border-purple-100">
                                            <h5 className="font-medium text-purple-700 mb-2">Images</h5>
                                            <p className="text-sm text-gray-600">
                                                {tr("guide.supportedFormats.images")}
                                            </p>
                                        </div>
                                        <div className="bg-white/70 p-4 rounded-lg border border-purple-100">
                                            <h5 className="font-medium text-purple-700 mb-2">Videos</h5>
                                            <p className="text-sm text-gray-600">
                                                {tr("guide.supportedFormats.videos")}
                                            </p>
                                        </div>
                                    </div>
                                </div>

                                {/* Советы */}
                                <div className="bg-linear-to-r from-green-50 to-emerald-50/50 p-5 md:p-6 rounded-xl border border-green-200">
                                    <h4 className="font-semibold text-lg mb-3 text-gray-900">
                                        {tr("guide.howToUse4")}
                                    </h4>
                                    <ul className="space-y-3">
                                        {[
                                            tr("guide.guide_instruction2.instruction1"),
                                            tr("guide.guide_instruction2.instruction2"),
                                            tr("guide.guide_instruction2.instruction3"),
                                            tr("guide.guide_instruction2.instruction4")
                                        ].map((item, index) => (
                                            <li key={index} className="flex items-start gap-3">
                                                <div className="shrink-0 w-5 h-5 mt-0.5 bg-green-100 text-green-600 rounded flex items-center justify-center">
                                                    ✓
                                                </div>
                                                <span className="text-gray-700">{item}</span>
                                            </li>
                                        ))}
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            <style jsx global>{`
                @keyframes slideDown {
                    from {
                        opacity: 0;
                        transform: translateY(-10px);
                    }
                    to {
                        opacity: 1;
                        transform: translateY(0);
                    }
                }
                
                @keyframes scaleIn {
                    from {
                        opacity: 0;
                        transform: scale(0.95);
                    }
                    to {
                        opacity: 1;
                        transform: scale(1);
                    }
                }
                
                .animate-slideDown {
                    animation: slideDown 0.2s ease-out;
                }
                
                .animate-scaleIn {
                    animation: scaleIn 0.2s ease-out;
                }
            `}</style>
        </>
    )
}