"use client"

import { useTranslation } from "@/i18n/LocaleProvider"
import { Github, X } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

export function Header() {
    const [isModalOpen, setIsModalOpen] = useState(false)
    const tr = useTranslation()
    return (
        <>
            <header className="w-full top-0 fixed z-50">
                <div className="bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-60 border m-5 border-gray-200 p-2 rounded-xl">
                    <div className="flex items-center min-h-[50px]">
                        <div className="flex items-center">
                            <img src={"/photo_2025-11-23_14-19-08.jpg"} className="shadow max-h-fit w-[50px] rounded-md" />
                            <Link href={"/"} className="ml-2 font-bold">Media2Mpl</Link>
                        </div>
                        <div className="ml-3 flex gap-x-1 items-center">
                            <Link className="" target="_blank" href={"/github"}>
                                <Github className="text-white size-8 rounded-md shadow p-1 bg-blue-500" />
                            </Link>
                            <Link className="" target="_blank"  href={"/github"}>
                                <svg width="32px" height="32px" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg" fill="#000000">
                                    <path d="M16 8A8 8 0 1 1 0 8a8 8 0 0 1 16 0zM8.287 5.906c-.778.324-2.334.994-4.666 2.01-.378.15-.577.298-.595.442-.03.243.275.339.69.47l.175.055c.408.133.958.288 1.243.294.26.006.549-.1.868-.32 2.179-1.471 3.304-2.214 3.374-2.23.05-.012.12-.026.166.016.047.041.042.12.037.141-.03.129-1.227 1.241-1.846 1.817-.193.18-.33.307-.358.336a8.154 8.154 0 0 1-.188.186c-.38.366-.664.64.015 1.088.327.216.589.393.85.571.284.194.568.387.936.629.093.06.183.125.27.187.331.236.63.448.997.414.214-.02.435-.22.547-.82.265-1.417.786-4.486.906-5.751a1.426 1.426 0 0 0-.013-.315.337.337 0 0 0-.114-.217.526.526 0 0 0-.31-.093c-.3.005-.763.166-2.984 1.09z" />
                                </svg>
                            </Link>
                        </div>
                        <div className="ml-auto flex items-center h-full gap-4">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="text-black cursor-pointer font-bold hover:opacity-80 transition-opacity"
                            >
                                Guide
                            </button>
                            <Link className="text-black font-bold cursor-pointer" href={"/gallery"}>Gallery</Link>
                        </div>
                    </div>
                </div>
            </header>

            {isModalOpen && (
                <div
                    className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-clip-padding backdrop-filter backdrop-blur-lg bg-opacity-60"
                    onClick={() => setIsModalOpen(false)}
                    role="dialog"
                    aria-modal="true"
                >
                    <div
                        className="bg-white/80 backdrop-blur-lg border border-gray-200 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto shadow-2xl"
                        onClick={(e) => e.stopPropagation()}
                    >
                        <div className="p-6">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-2xl font-bold text-gray-900">{tr("guide.title")}</h2>
                                <button
                                    onClick={() => setIsModalOpen(false)}
                                    className="text-gray-900 cursor-pointer text-2xl font-bold hover:opacity-70 transition-opacity w-8 h-8 flex items-center justify-center rounded-full hover:bg-gray-200"
                                    aria-label="Close"
                                >
                                    ×
                                </button>
                            </div>

                            <div className="space-y-4 text-gray-800">
                                <div className="bg-blue-50 p-4 rounded-lg">
                                    <h3 className="font-bold text-lg mb-2">{tr("guide.howToUse1")}</h3>
                                    <p>{tr("guide.howToUse2")}</p>
                                </div>

                                <div className="space-y-2">
                                    <h4 className="font-semibold">{tr("guide.guide_instruction1.instruction1")}</h4>
                                    <ol className="list-decimal list-inside space-y-1 ml-4">
                                        <li>{tr("guide.guide_instruction1.instruction2")}</li>
                                        <li>{tr("guide.guide_instruction1.instruction3")}</li>
                                        <li>{tr("guide.guide_instruction1.instruction4")}</li>
                                        <li>{tr("guide.guide_instruction1.instruction5")}</li>
                                    </ol>
                                </div>

                                <div className="bg-purple-50 p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2">{tr("guide.newFeatureTitle")}</h4>
                                    <p>{tr("guide.newFeatureText")}</p>
                                    <ul className="list-disc list-inside ml-4 mt-2">
                                        <li>• {tr("guide.supportedFormats.images")}</li>
                                        <li>• {tr("guide.supportedFormats.videos")}</li>
                                    </ul>
                                </div>

                                <div className="bg-green-50 p-4 rounded-lg">
                                    <h4 className="font-semibold mb-2">{tr("guide.howToUse4")}</h4>
                                    <ul className="space-y-1">
                                        <li>{tr("guide.guide_instruction2.instruction1")}</li>
                                        <li>{tr("guide.guide_instruction2.instruction2")}</li>
                                        <li>{tr("guide.guide_instruction2.instruction3")}</li>
                                        <li>{tr("guide.guide_instruction2.instruction4")}</li>
                                    </ul>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </>
    )
}