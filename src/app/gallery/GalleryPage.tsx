// app/gallery/page.tsx
"use client"

import { useState, useMemo } from "react"
import { useMPLCompiler } from "../ui/hooks/useMLPCompiler"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "../ui/Card"
import { Button } from "../ui/Button"
import {
    Play,
    Square,
    RotateCw,
    Grid3X3,
    List,
    Search,
    Filter,
    Download,
    Trash2,
    Clock,
    Calendar,
    Sparkles,
    Plus,
    SlidersHorizontal,
    X
} from "lucide-react"
import { ViewerMpl } from "../ui/3DViewerMpl"

interface GalleryItem {
    id: string
    name: string
    type: 'pose' | 'animation'
    prompt?: string
    mplCode: string
    timestamp: Date
    duration?: number
    category: string
    likes: number
    isPublic: boolean
    tags: string[]
}

// Расширенные тестовые данные с различными анимациями и позами
const TEST_ITEMS: Omit<GalleryItem, 'id' | 'timestamp'>[] = [
    {
        name: "Танцующая анимация шеи",
        type: 'animation',
        prompt: "Плавная анимация движений шеи с различными поворотами и наклонами",
        mplCode: `@pose pose_7 {
    neck sway left 15, turn right 15, bend forward 5;
}

@pose pose_2 {
    neck turn left 15, bend forward 5, sway right 15;
}

@pose pose_6 {
    neck sway right 15, turn left 15, bend forward 5;
}

@pose pose_4 {
    neck bend forward 5, sway right 15, turn left 15;
}

@pose pose_0 {
    base move backward 10, bend forward 90;
    center turn left 0, bend backward 10, sway left 0;
    upper_body bend backward 5;
    lower_body reset;
    waist reset;
    neck sway right 15, bend forward 5, turn left 15;
    head bend backward 30, sway right 0;
    shoulder_l reset;
    shoulder_r reset;
    arm_l turn left 10, bend forward 25, sway right 70;
    arm_r turn right 35, bend forward 15, sway left 65;
    elbow_l bend forward 60;
    wrist_l reset;
    wrist_r bend backward 10, turn left 50, sway left 10;
    leg_l reset;
    leg_r reset;
    knee_l reset;
    ankle_l reset;
    ankle_r reset;
    toe_l reset;
    toe_r reset;
    thumb_l reset;
    index_l reset;
    middle_l reset;
    ring_l reset;
    pinky_l reset;
    thumb_r reset;
    index_r sway left 0, bend forward 80;
    middle_r bend forward 80, sway right 0;
    ring_r bend forward 80, sway right 5;
    pinky_r bend forward 80, sway right 5;
}

@pose pose_1 {
    neck bend forward 5, sway left 15, turn right 15;
}

@pose pose_5 {
    neck sway right 15, bend forward 5, turn left 15;
}

@pose pose_3 {
    neck turn right 15, sway left 15, bend forward 5;
}

@pose pose_8 {
    neck bend forward 5, turn left 15, sway right 15;
}

@pose pose_9 {
    neck turn right 15, bend forward 5, sway left 15;
}

@animation extracted_animation {
    0.00: pose_0;
    1.00: pose_1;
    2.00: pose_2;
    3.00: pose_3;
    4.00: pose_2;
    5.00: pose_4;
    6.00: pose_1;
    7.00: pose_5;
    8.00: pose_3;
    9.00: pose_6;
    10.00: pose_2;
    11.00: pose_7;
    12.00: pose_4;
    13.00: pose_7;
    14.00: pose_6;
    15.00: pose_8;
    16.00: pose_9;
    17.00: pose_4;
    18.00: pose_9;
}

main {
    extracted_animation;
}`,
        duration: 18,
        category: "Танец",
        likes: 203,
        isPublic: true,
        tags: ["шея", "плавная", "танец"]
    },
    {
        name: "Приветственная поза",
        type: 'pose',
        prompt: "Открытая поза с приветственным жестом рук",
        mplCode: `@pose welcome_pose {
    base move forward 5;
    center bend backward 5;
    upper_body bend backward 10;
    neck bend forward 5;
    head bend backward 15;
    arm_l turn right 30, bend forward 45, sway left 20;
    arm_r turn left 30, bend forward 45, sway right 20;
    elbow_l bend forward 60;
    elbow_r bend forward 60;
    wrist_l bend backward 10;
    wrist_r bend backward 10;
}

main {
    welcome_pose;
}`,
        category: "Приветствие",
        likes: 156,
        isPublic: true,
        tags: ["приветствие", "руки", "открытая"]
    },
    {
        name: "Бегущая анимация",
        type: 'animation',
        prompt: "Циклическая анимация бега с движениями ног и рук",
        mplCode: `@pose run_start {
    leg_l bend forward 45;
    leg_r bend backward 30;
    arm_l bend backward 40;
    arm_r bend forward 40;
    center bend forward 10;
}

@pose run_mid {
    leg_l bend backward 30;
    leg_r bend forward 45;
    arm_l bend forward 40;
    arm_r bend backward 40;
    center bend forward 10;
}

@pose run_end {
    leg_l bend forward 45;
    leg_r bend backward 30;
    arm_l bend backward 40;
    arm_r bend forward 40;
    center bend forward 10;
}

@animation running {
    0.0: run_start;
    0.3: run_mid;
    0.6: run_end;
    1.0: run_start;
}

main {
    running;
}`,
        duration: 12,
        category: "Спорт",
        likes: 312,
        isPublic: true,
        tags: ["бег", "цикл", "ноги", "руки"]
    },
    {
        name: "Грустная поза",
        type: 'pose',
        prompt: "Поза выражающая грусть с опущенной головой и руками",
        mplCode: `@pose sad_pose {
    base move backward 5;
    center bend forward 20;
    neck bend forward 25;
    head bend forward 15;
    arm_l bend forward 70, sway left 10;
    arm_r bend forward 70, sway right 10;
    elbow_l bend forward 90;
    elbow_r bend forward 90;
}

main {
    sad_pose;
}`,
        category: "Эмоции",
        likes: 98,
        isPublic: false,
        tags: ["грусть", "эмоции", "голова"]
    },
    {
        name: "Танцевальная волна",
        type: 'animation',
        prompt: "Волнообразные движения тела в танцевальном стиле",
        mplCode: `@pose wave_start {
    center bend left 10;
    upper_body bend left 15;
    neck bend left 5;
}

@pose wave_mid {
    center bend right 10;
    upper_body bend right 15;
    neck bend right 5;
}

@pose wave_end {
    center bend left 10;
    upper_body bend left 15;
    neck bend left 5;
}

@animation dance_wave {
    0.0: wave_start;
    0.5: wave_mid;
    1.0: wave_end;
    1.5: wave_start;
}

main {
    dance_wave;
}`,
        duration: 8,
        category: "Танец",
        likes: 267,
        isPublic: true,
        tags: ["волна", "танец", "тело"]
    },
    {
        name: "Силовая стойка",
        type: 'pose',
        prompt: "Мощная поза с широкой стойкой и согнутыми руками",
        mplCode: `@pose power_pose {
    base move left 10, move right 10;
    center bend forward 5;
    leg_l turn left 15, bend forward 30;
    leg_r turn right 15, bend forward 30;
    arm_l bend forward 90, sway left 45;
    arm_r bend forward 90, sway right 45;
    elbow_l bend forward 60;
    elbow_r bend forward 60;
    neck bend forward 5;
}

main {
    power_pose;
}`,
        category: "Спорт",
        likes: 178,
        isPublic: true,
        tags: ["сила", "стойка", "руки"]
    }
]

export default function GalleryPage() {
    const mplCompiler = useMPLCompiler()
    const [items, setItems] = useState<GalleryItem[]>(() =>
        TEST_ITEMS.map(item => ({
            ...item,
            id: Math.random().toString(36).substr(2, 9),
            timestamp: new Date(Date.now() - Math.random() * 7 * 24 * 60 * 60 * 1000)
        }))
    )
    const [selectedItem, setSelectedItem] = useState<GalleryItem | null>(null)
    const [isAnimating, setIsAnimating] = useState(false)
    const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid')
    const [searchTerm, setSearchTerm] = useState('')
    const [filterType, setFilterType] = useState<'all' | 'pose' | 'animation'>('all')
    const [filterCategory, setFilterCategory] = useState<string>('all')
    const [selectedTags, setSelectedTags] = useState<string[]>([])
    const [showFilters, setShowFilters] = useState(false)

    // Все доступные теги
    const allTags = useMemo(() => {
        const tags = new Set<string>()
        items.forEach(item => {
            item.tags.forEach(tag => tags.add(tag))
        })
        return Array.from(tags).sort()
    }, [items])

    // Категории для фильтра
    const categories = useMemo(() => {
        const cats = Array.from(new Set(items.map(item => item.category)))
        return ['all', ...cats]
    }, [items])

    // Фильтрация и поиск
    const filteredItems = items.filter(item => {
        const matchesSearch = item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.prompt?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.category.toLowerCase().includes(searchTerm.toLowerCase()) ||
            item.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()))
        const matchesType = filterType === 'all' || item.type === filterType
        const matchesCategory = filterCategory === 'all' || item.category === filterCategory
        const matchesTags = selectedTags.length === 0 || selectedTags.every(tag => item.tags.includes(tag))

        return matchesSearch && matchesType && matchesCategory && matchesTags
    })

    const deleteItem = (id: string) => {
        setItems(prev => prev.filter(item => item.id !== id))
        if (selectedItem?.id === id) {
            setSelectedItem(null)
        }
    }

    const clearGallery = () => {
        if (confirm('Вы уверены, что хотите очистить всю галерею?')) {
            setItems([])
            setSelectedItem(null)
        }
    }

    const exportMplCode = (item: GalleryItem) => {
        const blob = new Blob([item.mplCode], { type: 'application/json' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${item.name}.mpl`
        a.click()
        URL.revokeObjectURL(url)
    }

    const likeItem = (id: string) => {
        setItems(prev => prev.map(item =>
            item.id === id ? { ...item, likes: item.likes + 1 } : item
        ))
    }

    const toggleTag = (tag: string) => {
        setSelectedTags(prev =>
            prev.includes(tag)
                ? prev.filter(t => t !== tag)
                : [...prev, tag]
        )
    }

    const clearFilters = () => {
        setSearchTerm('')
        setFilterType('all')
        setFilterCategory('all')
        setSelectedTags([])
    }

    const hasActiveFilters = searchTerm || filterType !== 'all' || filterCategory !== 'all' || selectedTags.length > 0

    return (
        <div className="min-h-screen mt-20 bg-gradient-to-br from-gray-50 to-blue-50 p-6">
            <div className="max-w-7xl mx-auto">
                {/* Заголовок */}
                <div className="text-center mb-12">
                    <h1 className="text-4xl font-bold text-gray-900 mb-4">
                        Галерея анимаций и поз
                    </h1>
                    <p className="text-xl text-gray-600 max-w-2xl mx-auto">
                        Коллекция созданных поз и анимаций для ваших проектов
                    </p>
                </div>

                {/* Статистика */}
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-sm">
                        <CardContent className="p-6 flex h-full items-center flex-col justify-center">
                            <div className="text-2xl font-bold text-blue-600">{items.length}</div>
                            <div className="text-gray-600">Всего элементов</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-sm">
                        <CardContent className="p-6 flex h-full items-center flex-col justify-center">
                            <div className="text-2xl font-bold text-green-600">
                                {items.filter(i => i.type === 'pose').length}
                            </div>
                            <div className="text-gray-600">Поз</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-sm">
                        <CardContent className="p-6 flex h-full items-center flex-col justify-center">
                            <div className="text-2xl font-bold text-purple-600">
                                {items.filter(i => i.type === 'animation').length}
                            </div>
                            <div className="text-gray-600">Анимаций</div>
                        </CardContent>
                    </Card>
                    <Card className="bg-white/80 backdrop-blur-sm border-0 shadow-sm">
                        <CardContent className="p-6 flex h-full items-center flex-col justify-center">
                            <div className="text-2xl font-bold text-red-600">
                                {items.reduce((sum, item) => sum + item.likes, 0)}
                            </div>
                            <div className="text-gray-600">Всего лайков</div>
                        </CardContent>
                    </Card>
                </div>

                {/* Улучшенная панель управления */}
                <Card className="mb-8 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                    <CardContent className="p-6">
                        <div className="flex flex-col gap-6">
                            {/* Верхняя строка: поиск и основные кнопки */}
                            <div className="flex flex-col lg:flex-row gap-4 items-center justify-between">
                                {/* Поиск с улучшенным дизайном */}
                                <div className="flex-1 w-full lg:max-w-lg">
                                    <div className="relative group">
                                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5 transition-colors group-focus-within:text-blue-500" />
                                        <input
                                            type="text"
                                            placeholder="Поиск по названию, промпту, категории или тегам..."
                                            value={searchTerm}
                                            onChange={(e) => setSearchTerm(e.target.value)}
                                            className="w-full pl-12 pr-4 py-3 border-2 border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 transition-all duration-200 hover:border-gray-300"
                                        />
                                        {searchTerm && (
                                            <button
                                                onClick={() => setSearchTerm('')}
                                                className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                                            >
                                                <X className="w-4 h-4" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                <div className="flex gap-3 items-center">
                                    {/* Кнопка фильтров для мобильных */}
                                    <Button
                                        variant={showFilters ? "solid" : "outline"}
                                        onClick={() => setShowFilters(!showFilters)}
                                        className="lg:hidden flex items-center gap-2"
                                    >
                                        <SlidersHorizontal className="w-4 h-4" />
                                        Фильтры
                                        {hasActiveFilters && (
                                            <span className="bg-blue-500 text-white rounded-full w-5 h-5 text-xs flex items-center justify-center">
                                                !
                                            </span>
                                        )}
                                    </Button>

                                    {/* Режим просмотра */}
                                    <div className="flex gap-1 bg-white/70 rounded-xl p-1 border-2 border-gray-200">
                                        <Button
                                            variant={viewMode === 'grid' ? "solid" : "ghost"}
                                            onClick={() => setViewMode('grid')}
                                            size="sm"
                                            className="rounded-lg transition-all"
                                        >
                                            <Grid3X3 className="w-4 h-4" />
                                        </Button>
                                        <Button
                                            variant={viewMode === 'list' ? "solid" : "ghost"}
                                            onClick={() => setViewMode('list')}
                                            size="sm"
                                            className="rounded-lg transition-all"
                                        >
                                            <List className="w-4 h-4" />
                                        </Button>
                                    </div>

                                    <Button className="flex items-center gap-2 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700">
                                        <Plus className="w-4 h-4" />
                                        Новый проект
                                    </Button>
                                </div>
                            </div>

                            {/* Расширенные фильтры */}
                            {(showFilters || window.innerWidth >= 1024) && (
                                <div className="border-t pt-6 space-y-4 animate-in fade-in duration-300">
                                    <div className="flex flex-col lg:flex-row gap-6 items-start lg:items-center justify-between">
                                        <div className="flex flex-col sm:flex-row gap-4 items-start sm:items-center">
                                            {/* Фильтр по типу */}
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-700 flex items-center gap-2">
                                                    <Filter className="w-4 h-4" />
                                                    Тип контента
                                                </label>
                                                <div className="flex gap-2">
                                                    {[
                                                        { value: 'all', label: 'Все', icon: '🎭' },
                                                        { value: 'pose', label: 'Позы', icon: '🕴️' },
                                                        { value: 'animation', label: 'Анимации', icon: '🎬' }
                                                    ].map(({ value, label, icon }) => (
                                                        <button
                                                            key={value}
                                                            onClick={() => setFilterType(value as any)}
                                                            className={`px-4 py-2 rounded-lg font-medium text-sm transition-all flex items-center gap-2 ${filterType === value
                                                                ? 'bg-blue-500 text-white shadow-md'
                                                                : 'bg-white/70 text-gray-700 border-2 border-gray-200 hover:border-blue-300'
                                                                }`}
                                                        >
                                                            <span>{icon}</span>
                                                            {label}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>

                                            {/* Фильтр по категории */}
                                            <div className="space-y-2">
                                                <label className="text-sm font-medium text-gray-700">
                                                    Категория
                                                </label>
                                                <select
                                                    value={filterCategory}
                                                    onChange={(e) => setFilterCategory(e.target.value)}
                                                    className="border-2 border-gray-200 rounded-xl px-4 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white/70 transition-all hover:border-gray-300"
                                                >
                                                    <option value="all">Все категории</option>
                                                    {categories.filter(cat => cat !== 'all').map(category => (
                                                        <option key={category} value={category}>{category}</option>
                                                    ))}
                                                </select>
                                            </div>
                                        </div>

                                        {/* Сброс фильтров */}
                                        {hasActiveFilters && (
                                            <Button
                                                variant="outline"
                                                onClick={clearFilters}
                                                className="flex items-center gap-2 text-gray-600 hover:text-gray-800 border-gray-300"
                                            >
                                                <X className="w-4 h-4" />
                                                Сбросить фильтры
                                            </Button>
                                        )}
                                    </div>

                                    {/* Фильтр по тегам */}
                                    <div className="space-y-3">
                                        <label className="text-sm font-medium text-gray-700">
                                            Теги
                                        </label>
                                        <div className="flex flex-wrap gap-2">
                                            {allTags.map(tag => (
                                                <button
                                                    key={tag}
                                                    onClick={() => toggleTag(tag)}
                                                    className={`px-3 py-1.5 rounded-full text-sm font-medium transition-all flex items-center gap-1 ${selectedTags.includes(tag)
                                                        ? 'bg-gradient-to-r from-blue-500 to-purple-600 text-white shadow-md'
                                                        : 'bg-white/70 text-gray-700 border-2 border-gray-200 hover:border-blue-300'
                                                        }`}
                                                >
                                                    {tag}
                                                    {selectedTags.includes(tag) && (
                                                        <X className="w-3 h-3" />
                                                    )}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    {/* Активные фильтры */}
                                    {hasActiveFilters && (
                                        <div className="flex items-center gap-2 text-sm text-gray-600">
                                            <span>Активные фильтры:</span>
                                            {filterType !== 'all' && (
                                                <span className="bg-blue-100 text-blue-800 px-2 py-1 rounded-full text-xs">
                                                    Тип: {filterType === 'pose' ? 'Позы' : 'Анимации'}
                                                </span>
                                            )}
                                            {filterCategory !== 'all' && (
                                                <span className="bg-green-100 text-green-800 px-2 py-1 rounded-full text-xs">
                                                    Категория: {filterCategory}
                                                </span>
                                            )}
                                            {selectedTags.map(tag => (
                                                <span key={tag} className="bg-purple-100 text-purple-800 px-2 py-1 rounded-full text-xs">
                                                    #{tag}
                                                </span>
                                            ))}
                                            {searchTerm && (
                                                <span className="bg-orange-100 text-orange-800 px-2 py-1 rounded-full text-xs">
                                                    Поиск: "{searchTerm}"
                                                </span>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}
                        </div>
                    </CardContent>
                </Card>

                {/* Результаты поиска */}
                <div className="flex items-center justify-between mb-6">
                    <div className="text-gray-600">
                        Найдено {filteredItems.length} из {items.length} элементов
                    </div>
                    {hasActiveFilters && (
                        <Button
                            variant="ghost"
                            onClick={clearFilters}
                            size="sm"
                            className="text-gray-500 hover:text-gray-700"
                        >
                            <X className="w-4 h-4 mr-1" />
                            Очистить
                        </Button>
                    )}
                </div>

                {/* Контент */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                    {/* Список элементов */}
                    <div className={`${selectedItem ? 'lg:col-span-3' : 'lg:col-span-4'}`}>
                        {filteredItems.length === 0 ? (
                            <Card className="text-center py-16 bg-white/80 backdrop-blur-sm border-0 shadow-lg">
                                <CardContent className="space-y-4">
                                    <div className="text-6xl mb-4">🔍</div>
                                    <h3 className="text-xl font-semibold text-gray-900 mb-2">
                                        {items.length === 0 ? 'Галерея пуста' : 'Ничего не найдено'}
                                    </h3>
                                    <p className="text-gray-600 mb-6 max-w-md mx-auto">
                                        {items.length === 0
                                            ? 'Начните создавать анимации и позы, чтобы они появились в вашей галерее'
                                            : 'Попробуйте изменить параметры поиска или фильтры'}
                                    </p>
                                    <div className="flex gap-3 justify-center">
                                        <Button onClick={clearFilters}>
                                            Сбросить фильтры
                                        </Button>
                                        {items.length === 0 && (
                                            <Button variant="outline">
                                                Создать первую анимацию
                                            </Button>
                                        )}
                                    </div>
                                </CardContent>
                            </Card>
                        ) : viewMode === 'grid' ? (
                            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
                                {filteredItems.map((item) => (
                                    <Card
                                        key={item.id}
                                        className={`cursor-pointer transition-all duration-300 hover:scale-105 hover:shadow-xl bg-white/80 backdrop-blur-sm border-0 shadow-sm ${selectedItem?.id === item.id ? 'ring-2 ring-blue-500 shadow-lg' : ''
                                            }`}
                                        onClick={() => setSelectedItem(item)}
                                    >
                                        <CardHeader className="p-0">
                                            {/* Превью */}
                                            <div className="aspect-video bg-gradient-to-br from-blue-100 to-purple-100 rounded-t-xl relative overflow-hidden">
                                                <div className="absolute inset-0 flex items-center justify-center">
                                                    {mplCompiler ? (
                                                        <ViewerMpl
                                                            mplCompiler={mplCompiler}
                                                            mpl_code={item.mplCode}
                                                            isAnimating={false}
                                                        />
                                                    ) : (
                                                        <div className="text-center">
                                                            <div className="text-4xl mb-2">
                                                                {item.type === 'pose' ? '🕴️' : '🎬'}
                                                            </div>
                                                            <div className="text-sm text-gray-600">
                                                                {item.type === 'pose' ? '3D Поза' : '3D Анимация'}
                                                            </div>
                                                        </div>
                                                    )}
                                                </div>

                                                {/* Бейдж типа */}
                                                <div className={`absolute top-3 left-3 px-3 py-1 rounded-full text-xs font-semibold ${item.type === 'pose'
                                                    ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                                    : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                                                    }`}>
                                                    {item.type === 'pose' ? 'Поза' : 'Анимация'}
                                                </div>

                                                {/* Бейдж приватности */}
                                                {!item.isPublic && (
                                                    <div className="absolute top-3 right-3 px-2 py-1 rounded-full text-xs bg-yellow-500 text-white">
                                                        Приватный
                                                    </div>
                                                )}

                                                {/* Длительность для анимаций */}
                                                {item.type === 'animation' && item.duration && (
                                                    <div className="absolute bottom-3 left-3 flex items-center gap-1 px-2 py-1 rounded-full text-xs bg-black/70 text-white backdrop-blur-sm">
                                                        <Clock className="w-3 h-3" />
                                                        {item.duration}с
                                                    </div>
                                                )}

                                                {/* Теги */}
                                                <div className="absolute bottom-3 right-3 flex gap-1">
                                                    {item.tags.slice(0, 2).map(tag => (
                                                        <span
                                                            key={tag}
                                                            className="px-2 py-1 rounded-full text-xs bg-white/90 text-gray-700 backdrop-blur-sm"
                                                        >
                                                            #{tag}
                                                        </span>
                                                    ))}
                                                    {item.tags.length > 2 && (
                                                        <span className="px-2 py-1 rounded-full text-xs bg-white/90 text-gray-500 backdrop-blur-sm">
                                                            +{item.tags.length - 2}
                                                        </span>
                                                    )}
                                                </div>
                                            </div>
                                        </CardHeader>

                                        <CardContent className="p-4">
                                            <div className="flex justify-between items-start mb-2">
                                                <CardTitle className="text-lg font-bold text-gray-900 line-clamp-1">
                                                    {item.name}
                                                </CardTitle>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    onClick={(e) => {
                                                        e.stopPropagation()
                                                        likeItem(item.id)
                                                    }}
                                                    className="flex items-center gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                >
                                                    ❤️ {item.likes}
                                                </Button>
                                            </div>

                                            {item.prompt && (
                                                <CardDescription className="text-sm text-gray-600 line-clamp-2 mb-3">
                                                    {item.prompt}
                                                </CardDescription>
                                            )}

                                            <div className="flex justify-between items-center text-xs text-gray-500">
                                                <div className="flex items-center gap-1">
                                                    <Calendar className="w-3 h-3" />
                                                    {item.timestamp.toLocaleDateString()}
                                                </div>
                                                <div className="flex gap-1">
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            exportMplCode(item)
                                                        }}
                                                        className="h-8 w-8 p-0 hover:bg-blue-50 text-blue-600 transition-colors"
                                                    >
                                                        <Download className="w-3 h-3" />
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            deleteItem(item.id)
                                                        }}
                                                        className="h-8 w-8 p-0 text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 className="w-3 h-3" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        ) : (
                            // Режим списка
                            <div className="space-y-4">
                                {filteredItems.map((item) => (
                                    <Card
                                        key={item.id}
                                        className={`cursor-pointer transition-all hover:shadow-lg bg-white/80 backdrop-blur-sm border-0 shadow-sm ${selectedItem?.id === item.id ? 'ring-2 ring-blue-500' : ''
                                            }`}
                                        onClick={() => setSelectedItem(item)}
                                    >
                                        <CardContent className="p-4">
                                            <div className="flex items-center gap-4">
                                                {/* Превью */}
                                                <div className="w-24 h-24 bg-gradient-to-br from-blue-100 to-purple-100 rounded-xl flex-shrink-0 overflow-hidden relative">
                                                    {mplCompiler ? (
                                                        <ViewerMpl
                                                            mplCompiler={mplCompiler}
                                                            mpl_code={item.mplCode}
                                                            isAnimating={false}
                                                        />
                                                    ) : (
                                                        <div className="w-full h-full flex items-center justify-center">
                                                            <div className="text-2xl">
                                                                {item.type === 'pose' ? '🕴️' : '🎬'}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {!item.isPublic && (
                                                        <div className="absolute top-1 right-1 px-1.5 py-0.5 rounded-full text-xs bg-yellow-500 text-white">
                                                            Приватный
                                                        </div>
                                                    )}
                                                </div>

                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-2">
                                                        <CardTitle className="text-xl font-bold text-gray-900 truncate">
                                                            {item.name}
                                                        </CardTitle>
                                                        <span className={`text-xs px-2 py-1 rounded-full ${item.type === 'pose'
                                                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                                            : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                                                            }`}>
                                                            {item.type === 'pose' ? 'Поза' : 'Анимация'}
                                                        </span>
                                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                                            {item.category}
                                                        </span>
                                                    </div>

                                                    {item.prompt && (
                                                        <CardDescription className="text-sm text-gray-600 mb-2">
                                                            {item.prompt}
                                                        </CardDescription>
                                                    )}

                                                    {/* Теги в списке */}
                                                    <div className="flex flex-wrap gap-1 mb-2">
                                                        {item.tags.map(tag => (
                                                            <span
                                                                key={tag}
                                                                className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-600"
                                                            >
                                                                #{tag}
                                                            </span>
                                                        ))}
                                                    </div>

                                                    <div className="flex items-center gap-4 text-sm text-gray-500">
                                                        <div className="flex items-center gap-1">
                                                            <Calendar className="w-4 h-4" />
                                                            {item.timestamp.toLocaleDateString()}
                                                        </div>
                                                        {item.type === 'animation' && item.duration && (
                                                            <div className="flex items-center gap-1">
                                                                <Clock className="w-4 h-4" />
                                                                {item.duration}с
                                                            </div>
                                                        )}
                                                        <Button
                                                            variant="ghost"
                                                            size="sm"
                                                            onClick={(e) => {
                                                                e.stopPropagation()
                                                                likeItem(item.id)
                                                            }}
                                                            className="flex items-center gap-1 text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                        >
                                                            ❤️ {item.likes}
                                                        </Button>
                                                    </div>
                                                </div>

                                                <div className="flex gap-2 flex-shrink-0">
                                                    <Button
                                                        variant="solid"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            exportMplCode(item)
                                                        }}
                                                        className="bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                                                    >
                                                        <Download className="w-4 h-4 mr-2" />
                                                        Экспорт
                                                    </Button>
                                                    <Button
                                                        variant="ghost"
                                                        size="sm"
                                                        onClick={(e) => {
                                                            e.stopPropagation()
                                                            deleteItem(item.id)
                                                        }}
                                                        className="text-red-500 hover:text-red-600 hover:bg-red-50 transition-colors"
                                                    >
                                                        <Trash2 className="w-4 h-4" />
                                                    </Button>
                                                </div>
                                            </div>
                                        </CardContent>
                                    </Card>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Детальный просмотр */}
                    {selectedItem && (
                        <div className="lg:col-span-1">
                            <Card className="sticky top-6 bg-white/80 backdrop-blur-sm border-0 shadow-xl">
                                <CardHeader>
                                    <CardTitle className="flex justify-between items-center">
                                        <span className="text-xl">{selectedItem.name}</span>
                                        <Button
                                            variant="ghost"
                                            size="sm"
                                            onClick={() => setSelectedItem(null)}
                                            className="h-8 w-8 p-0 hover:bg-gray-100 transition-colors"
                                        >
                                            ✕
                                        </Button>
                                    </CardTitle>
                                    <div className="flex flex-wrap gap-2">
                                        <span className={`text-xs px-2 py-1 rounded-full ${selectedItem.type === 'pose'
                                            ? 'bg-gradient-to-r from-green-500 to-emerald-600 text-white'
                                            : 'bg-gradient-to-r from-blue-500 to-purple-600 text-white'
                                            }`}>
                                            {selectedItem.type === 'pose' ? 'Поза' : 'Анимация'}
                                        </span>
                                        <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-700">
                                            {selectedItem.category}
                                        </span>
                                        {!selectedItem.isPublic && (
                                            <span className="text-xs px-2 py-1 rounded-full bg-yellow-500 text-white">
                                                Приватный
                                            </span>
                                        )}
                                        {selectedItem.tags.map(tag => (
                                            <span
                                                key={tag}
                                                className="text-xs px-2 py-1 rounded-full bg-blue-100 text-blue-800"
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                    </div>
                                </CardHeader>

                                <CardContent className="space-y-4">
                                    {/* 3D просмотр */}
                                    <div className="aspect-square bg-gradient-to-br from-blue-50 to-purple-50 rounded-xl overflow-hidden border-2 border-gray-200">
                                        {mplCompiler ? (
                                            <ViewerMpl
                                                mplCompiler={mplCompiler}
                                                mpl_code={selectedItem.mplCode}
                                                isAnimating={isAnimating}
                                            />
                                        ) : (
                                            <div className="w-full h-full flex items-center justify-center">
                                                <div className="text-center">
                                                    <div className="text-6xl mb-4">
                                                        {selectedItem.type === 'pose' ? '🕴️' : '🎬'}
                                                    </div>
                                                    <p className="text-gray-600">3D просмотр недоступен</p>
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Управление анимацией */}
                                    {selectedItem.type === 'animation' && (
                                        <div className="flex gap-2 justify-center">
                                            <Button
                                                onClick={() => setIsAnimating(true)}
                                                disabled={isAnimating}
                                                size="sm"
                                                className="flex-1 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700"
                                            >
                                                <Play className="w-4 h-4 mr-2" />
                                                Старт
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => setIsAnimating(false)}
                                                disabled={!isAnimating}
                                                size="sm"
                                            >
                                                <Square className="w-4 h-4" />
                                            </Button>
                                            <Button
                                                variant="outline"
                                                onClick={() => {
                                                    setIsAnimating(false)
                                                    setTimeout(() => setIsAnimating(true), 100)
                                                }}
                                                size="sm"
                                            >
                                                <RotateCw className="w-4 h-4" />
                                            </Button>
                                        </div>
                                    )}

                                    {/* Информация */}
                                    <div className="space-y-3 text-sm">
                                        {selectedItem.prompt && (
                                            <div>
                                                <div className="flex items-center gap-2 text-gray-600 mb-1">
                                                    <Sparkles className="w-4 h-4" />
                                                    <span className="font-medium">Описание</span>
                                                </div>
                                                <p className="text-gray-700">{selectedItem.prompt}</p>
                                            </div>
                                        )}

                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Создано:</span>
                                            <span className="font-medium">
                                                {selectedItem.timestamp.toLocaleDateString()}
                                            </span>
                                        </div>

                                        {selectedItem.type === 'animation' && selectedItem.duration && (
                                            <div className="flex justify-between">
                                                <span className="text-gray-600">Длительность:</span>
                                                <span className="font-medium">{selectedItem.duration} секунд</span>
                                            </div>
                                        )}

                                        <div className="flex justify-between">
                                            <span className="text-gray-600">Лайки:</span>
                                            <span className="font-medium flex items-center gap-1">
                                                ❤️ {selectedItem.likes}
                                            </span>
                                        </div>
                                    </div>

                                    {/* Действия */}
                                    <div className="flex gap-2 pt-4 border-t">
                                        <Button
                                            onClick={() => exportMplCode(selectedItem)}
                                            className="flex-1 bg-gradient-to-r from-blue-500 to-purple-600 hover:from-blue-600 hover:to-purple-700"
                                        >
                                            <Download className="w-4 h-4 mr-2" />
                                            Экспорт MPL
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => likeItem(selectedItem.id)}
                                            className="text-red-500 border-red-200 hover:bg-red-50 transition-colors"
                                        >
                                            ❤️
                                        </Button>
                                        <Button
                                            variant="outline"
                                            onClick={() => deleteItem(selectedItem.id)}
                                            className="text-red-500 border-red-200 hover:bg-red-50 transition-colors"
                                        >
                                            <Trash2 className="w-4 h-4" />
                                        </Button>
                                    </div>

                                    {/* Предпросмотр MPL кода для анимации */}
                                    {selectedItem.type === 'animation' && (
                                        <div className="mt-4">
                                            <details>
                                                <summary className="cursor-pointer font-medium text-gray-700 hover:text-gray-900 transition-colors">
                                                    Просмотреть MPL код
                                                </summary>
                                                <pre className="mt-2 p-3 bg-gray-100 rounded-lg text-xs overflow-auto max-h-40 border border-gray-200">
                                                    {selectedItem.mplCode}
                                                </pre>
                                            </details>
                                        </div>
                                    )}
                                </CardContent>
                            </Card>
                        </div>
                    )}
                </div>
            </div>
        </div>
    )
}