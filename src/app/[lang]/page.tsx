import { Locale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";
import { MainClientPage } from "./MainClientPage";

export default async function MainPage({
    params,
}: {
    params: Promise<{ lang: Locale }>;
}) {
    const { lang } = await params;
    const dict = await getDictionary(lang);
    return <MainClientPage t={dict} />
}