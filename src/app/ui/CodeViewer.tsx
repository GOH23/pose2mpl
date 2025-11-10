import { useCallback } from "react"
import CodeMirror from "@uiw/react-codemirror"
import { EditorView, Decoration, DecorationSet } from "@codemirror/view"
import { Extension, StateField, Range, Text } from "@codemirror/state"
import { linter, Diagnostic } from "@codemirror/lint"
import { autocompletion, CompletionContext, CompletionResult } from "@codemirror/autocomplete"

// --- ТИПЫ ---
type SectionType = "none" | "main" | "pose" | "animation"

// --- Паттерны подсветки ---
const mplPatterns = [
    { regex: /\b(waist|head|upper_body|upper_body2|lower_body|base|center|neck|shoulder_[rl]|arm_[rl]|arm_twist_[rl]|elbow_[rl]|wrist_[rl]|wrist_twist_[rl]|leg_[rl]|knee_[rl]|ankle_[rl]|toe_[rl]|thumb_\d+_[rl]|pinky_\d+_[rl]|ring_\d+_[rl]|middle_\d+_[rl]|index_\d+_[rl])\b/g, className: "cm-mpl-bone" },
    { regex: /@(pose|animation|main)\b/g, className: "cm-mpl-directive" },
    { regex: /\b(bend|turn|sway|move)\b/g, className: "cm-mpl-action" },
    { regex: /\b(forward|backward|left|right|up|down)\b/g, className: "cm-mpl-direction" },
    { regex: /\b\d+(\.\d+)?\b/g, className: "cm-mpl-degrees" },
    { regex: /[{}]/g, className: "cm-mpl-brace" },
    { regex: /;/g, className: "cm-mpl-semicolon" },
]

// --- Создание декораций ---
const createDecorations = (doc: Text): Range<Decoration>[] => {
    const decorations: Range<Decoration>[] = []
    const text = doc.toString()
    for (const { regex, className } of mplPatterns) {
        regex.lastIndex = 0
        let match
        while ((match = regex.exec(text)) !== null) {
            const from = match.index
            const to = match.index + match[0].length
            decorations.push(Decoration.mark({ class: className }).range(from, to))
        }
    }
    return decorations.sort((a, b) => a.from - b.from)
}

const mplHighlightField = StateField.define<DecorationSet>({
    create(state) { return Decoration.set(createDecorations(state.doc)) },
    update(decorations, transaction) {
        if (transaction.docChanged) {
            return Decoration.set(createDecorations(transaction.state.doc))
        }
        return decorations.map(transaction.changes)
    },
    provide: (f) => EditorView.decorations.from(f),
})

// --- УЛУЧШЕННАЯ ПРОВЕРКА ОШИБОК ---
const mplLinter = linter((view) => {
    const diagnostics: Diagnostic[] = []
    const doc = view.state.doc
    const text = doc.toString()

    let currentSection: SectionType = "none"
    let sectionName = ""
    const poseDefinitions = new Set<string>()
    const animationDefinitions = new Set<string>()
    const braceStack: { pos: number; section: SectionType; name: string }[] = []
    let lineStart = 0

    text.split("\n").forEach((line, idx) => {
        const lineNumber = idx + 1
        const from = lineStart
        const to = lineStart + line.length
        const trimmed = line.trim()

        // Проверка секций
        const sectionMatch = trimmed.match(/^@(pose|animation)\s+(\w+)\s*\{$/)
        if (sectionMatch) {
            const [, section, name] = sectionMatch
            if (section === "pose") {
                currentSection = "pose"
                poseDefinitions.add(name)
                sectionName = name
            } else if (section === "animation") {
                currentSection = "animation"
                animationDefinitions.add(name)
                sectionName = name
            }
            braceStack.push({ pos: to - 1, section: currentSection, name: sectionName })
            lineStart += line.length + 1
            return
        }

        // Главная секция
        if (trimmed === "main {") {
            currentSection = "main"
            sectionName = "main"
            braceStack.push({ pos: to - 1, section: "main", name: "main" })
            lineStart += line.length + 1
            return
        }

        // Закрытие скобок
        if (trimmed === "}") {
            if (braceStack.length === 0) {
                diagnostics.push({ from, to, severity: "error", message: "Лишняя закрывающая скобка" })
            } else {
                const opened = braceStack.pop()!
                // Проверка содержимого секции
                if (opened.section === "animation") {
                    const content = text.slice(opened.pos + 1, from)
                    const invalidLines = content.split("\n").filter((l) => {
                        const t = l.trim()
                        return t && !/^\d+\.\d+:\s+\w+;$/.test(t)
                    })
                    if (invalidLines.length > 0) {
                        diagnostics.push({
                            from: opened.pos,
                            to: from,
                            severity: "error",
                            message: `@animation ${opened.name}: Неверный формат. Ожидается "время: pose_name;"`,
                        })
                    }
                } else if (opened.section === "pose") {
                    const content = text.slice(opened.pos + 1, from)
                    const invalidLines = content.split("\n").filter((l) => {
                        const t = l.trim()
                        return t && !/^\w+\s+(bend|turn|sway|move)\s+(forward|backward|left|right|up|down)\s+\d+(\.\d+)?;$/.test(t)
                    })
                    if (invalidLines.length > 0) {
                        diagnostics.push({
                            from: opened.pos,
                            to: from,
                            severity: "error",
                            message: `@pose ${opened.name}: Неверный формат команды`,
                        })
                    }
                }
            }
            currentSection = braceStack.length > 0 ? braceStack[braceStack.length - 1].section : "none"
            lineStart += line.length + 1
            return
        }

        // Проверка содержимого секций
        if (trimmed && !/^[@}]/.test(trimmed)) {
            if (currentSection === "main") {
                const callMatch = trimmed.match(/^(\w+);$/)
                if (callMatch) {
                    const name = callMatch[1]
                    if (!animationDefinitions.has(name) && !poseDefinitions.has(name)) {
                        diagnostics.push({
                            from,
                            to,
                            severity: "error",
                            message: `'${name}' не определено. Создайте @pose ${name} или @animation ${name}`,
                        })
                    }
                }
            } else if (currentSection === "animation") {
                if (!/^\d+\.\d+:\s+\w+;$/.test(trimmed)) {
                    diagnostics.push({ from, to, severity: "error", message: 'Неверный формат. Ожидается: время: pose_name;' })
                }
            } else if (currentSection === "pose") {
                if (!/^\w+\s+(bend|turn|sway|move)\s+(forward|backward|left|right|up|down)\s+\d+(\.\d+)?;$/.test(trimmed)) {
                    diagnostics.push({ from, to, severity: "error", message: 'Неверный формат. Ожидается: кость действие направление градусы;' })
                }
            }
        }

        lineStart += line.length + 1
    })

    // Незакрытые скобки
    braceStack.forEach(({ pos, section, name }) => {
        diagnostics.push({ from: pos, to: pos + 1, severity: "error", message: `Незакрытая скобка в @${section} ${name}` })
    })

    return diagnostics
})

// --- УЛУЧШЕННОЕ АВТОДОПОЛНЕНИЕ ---
const mplCompletionSource = (context: CompletionContext): CompletionResult | null => {
    const { state, pos } = context
    const line = state.doc.lineAt(pos)
    const lineText = line.text
    const linePos = pos - line.from

    // Директивы
    if (/@\w*$/.test(lineText.slice(0, linePos))) {
        return {
            from: line.from + lineText.lastIndexOf("@"),
            to: pos,
            options: [
                { label: "@pose", type: "keyword", detail: "Секция позы" },
                { label: "@animation", type: "keyword", detail: "Секция анимации" },
            ],
        }
    }

    const section = getCurrentSection(state, pos)

    if (section?.type === "pose") {
        // Кости
        const boneMatch = lineText.slice(0, linePos).match(/\b(\w*)$/)
        if (boneMatch && lineText.split(/\s+/).length <= 2) {
            const bones = [
                "waist", "head", "upper_body", "upper_body2", "lower_body", "base", "center", "neck",
                "shoulder_l", "shoulder_r", "arm_l", "arm_r", "leg_l", "leg_r",
            ]
            return {
                from: line.from + boneMatch.index!,
                to: pos,
                options: bones.map((b) => ({ label: b, type: "variable", detail: "Кость" })),
            }
        }

        // Действия
        if (/\w+\s+(\w*)$/.test(lineText.slice(0, linePos))) {
            return {
                from: pos - (lineText.match(/\w+$/)?.[0].length || 0),
                to: pos,
                options: [
                    { label: "bend", type: "function", detail: "Изгиб" },
                    { label: "turn", type: "function", detail: "Поворот" },
                    { label: "sway", type: "function", detail: "Покачивание" },
                    { label: "move", type: "function", detail: "Перемещение" },
                ],
            }
        }
    }

    return null
}

// --- Вспомогательная функция ---
function getCurrentSection(state: any, pos: number): { type: SectionType; name: string } | null {
    const text = state.doc.toString()
    const beforeText = text.slice(0, pos)

    const sectionMatch = beforeText.match(/@(pose|animation)\s+(\w+)\s*\{.*?$/s)
    if (sectionMatch) {
        return { type: sectionMatch[1] as SectionType, name: sectionMatch[2] }
    }
    if (/main\s*\{.*?$/s.test(beforeText)) {
        return { type: "main", name: "main" }
    }
    return null
}

// --- Синтаксис + тема ---
const mplSyntaxHighlighting = (): Extension => {
    return [
        mplHighlightField,
        EditorView.theme({
            ".cm-mpl-directive": { color: "#ff0080", fontWeight: "bold" },
            ".cm-mpl-bone": { color: "#0080ff", fontWeight: "600" },
            ".cm-mpl-action": { color: "#00bfff", fontWeight: "bold" },
            ".cm-mpl-direction": { color: "#ff6600", fontWeight: "bold" },
            ".cm-mpl-degrees": { color: "#00cc00", fontWeight: "bold" },
            ".cm-mpl-brace": { color: "#666666", fontWeight: "bold" },
            ".cm-mpl-semicolon": { color: "#666666", fontWeight: "bold" },
            ".cm-lint-range-error": { textDecoration: "underline wavy red" },
            ".cm-lint-range-warning": { textDecoration: "underline wavy orange" },
        }),
        autocompletion({ override: [mplCompletionSource], activateOnTyping: true }),
        mplLinter,
    ]
}

// --- Компонент ---
export default function CodeViewer({ value, onChange, readOnly = false }: { value: string; onChange?: (value: string) => void; readOnly?: boolean; }) {
    const handleChange = useCallback((val: string) => { onChange?.(val) }, [onChange])
    const extensions = [
        mplSyntaxHighlighting(),
        EditorView.theme({
            ".cm-editor": { fontSize: "14px", fontFamily: "Geist Mono, monospace" },
            ".cm-content": { fontFamily: "Geist Mono, monospace", fontSize: "14px" },
        }),
    ]

    return (
        <div className="border border-gray-200 dark:border-gray-700 rounded-md overflow-hidden">
            <CodeMirror
                readOnly={readOnly}
                value={value}
                height="200px"
                onChange={handleChange}
                extensions={extensions}
                basicSetup={{
                    lineNumbers: true,
                    foldGutter: true,
                    dropCursor: false,
                    allowMultipleSelections: false,
                    indentOnInput: true,
                    bracketMatching: true,
                    closeBrackets: true,
                    highlightSelectionMatches: false,
                    searchKeymap: false,
                    tabSize: 4,
                }}
            />
        </div>
    )
}