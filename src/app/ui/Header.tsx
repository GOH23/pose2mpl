"use client"

import { useTranslation } from "@/i18n/LocaleProvider"
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
                        <div className="flex">
                            <img src={"/photo_2025-11-23_14-19-08.jpg"} className="shadow max-h-fit w-[50px] rounded-md" />
                        </div>
                        <div className="ml-auto flex items-center h-full gap-4">
                            <button
                                onClick={() => setIsModalOpen(true)}
                                className="text-black cursor-pointer font-bold hover:opacity-80 transition-opacity"
                            >
                                Guide
                            </button>
                            <Link className="text-black font-bold cursor-pointer" href={""}>Gallery</Link>
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