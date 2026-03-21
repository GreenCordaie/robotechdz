"use client";

import React, { useState } from "react";
import {
    Card,
    CardBody,
    CardHeader,
    Button,
    Divider,
    Chip,
    Table,
    TableHeader,
    TableColumn,
    TableBody,
    TableRow,
    TableCell,
    Tab,
    Tabs,
    Spinner,
} from "@heroui/react";
import {
    TrendingUp,
    TrendingDown,
    Users,
    Package,
    DollarSign,
    Calendar,
    RefreshCw,
    Sparkles,
    Lightbulb,
} from "lucide-react";
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    CartesianGrid,
    Tooltip,
    ResponsiveContainer,
    BarChart,
    Bar,
    Cell,
    Legend,
} from "recharts";
import { format } from "date-fns";
import { fr } from "date-fns/locale";
import toast from "react-hot-toast";
import { getAnalyticsOverview, getAnalyticsRankings, getMarketingRecommendations } from "./actions";

interface AnalyticsContentProps {
    initialOverview: any;
    initialRankings: any;
}

export default function AnalyticsContent({ initialOverview, initialRankings }: AnalyticsContentProps) {
    const [overview, setOverview] = useState(initialOverview);
    const [rankings, setRankings] = useState(initialRankings);
    const [recommendations, setRecommendations] = useState<string | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isGeneratingIA, setIsGeneratingIA] = useState(false);

    const refreshData = async () => {
        setIsLoading(true);
        try {
            const [oRes, rRes] = await Promise.all([
                getAnalyticsOverview({}),
                getAnalyticsRankings({})
            ]);

            if (oRes.success) setOverview(oRes.data);
            if (rRes.success) setRankings(rRes.data);

            toast.success("Données actualisées");
        } catch (err) {
            toast.error("Erreur lors de l'actualisation");
        } finally {
            setIsLoading(false);
        }
    };

    const generateAIRecommendations = async () => {
        setIsGeneratingIA(true);
        try {
            const res = await getMarketingRecommendations({});
            if (res.success) {
                setRecommendations(res.data);
                toast.success("Analyses marketing générées");
            } else {
                toast.error(res.error || "Erreur IA");
            }
        } catch (err) {
            toast.error("Échec de la connexion à l'IA");
        } finally {
            setIsGeneratingIA(false);
        }
    };

    if (!overview || !rankings) {
        return (
            <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
                <Spinner size="lg" color="warning" />
                <p className="text-default-500">Chargement des analyses...</p>
            </div>
        );
    }

    const { overview: stats, chartData } = overview;
    const { topClients, topProducts } = rankings;

    const formatCurrency = (val: number) =>
        new Intl.NumberFormat('fr-DZ', { style: 'currency', currency: 'DZD' }).format(val);

    const kpis = [
        {
            title: "Chiffre d'Affaires",
            value: formatCurrency(stats.revenue),
            subtitle: "Ventes totales (Mois en cours)",
            icon: <DollarSign className="text-orange-500" />,
            color: "warning"
        },
        {
            title: "Marge Nette",
            value: formatCurrency(stats.margin),
            subtitle: `${stats.marginPercentage.toFixed(1)}% de rentabilité`,
            icon: stats.margin > 0 ? <TrendingUp className="text-green-500" /> : <TrendingDown className="text-red-500" />,
            color: stats.margin > 0 ? "success" : "danger"
        },
        {
            title: "Commandes",
            value: stats.orderCount,
            subtitle: "Traitées avec succès",
            icon: <Calendar className="text-blue-500" />,
            color: "primary"
        },
        {
            title: "Clients Actifs",
            value: topClients.length,
            subtitle: "Top contributeurs",
            icon: <Users className="text-purple-500" />,
            color: "secondary"
        }
    ];

    return (
        <div className="p-4 md:p-8 flex flex-col gap-8 max-w-7xl mx-auto">
            {/* Header */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h1 className="text-3xl font-bold bg-gradient-to-r from-orange-500 to-yellow-500 bg-clip-text text-transparent">
                        Business Intelligence
                    </h1>
                    <p className="text-default-500">Suivi des performances et rentabilité en temps réel.</p>
                </div>
                <Button
                    variant="flat"
                    color="warning"
                    startContent={<RefreshCw size={18} className={isLoading ? "animate-spin" : ""} />}
                    onPress={refreshData}
                    isLoading={isLoading}
                >
                    Actualiser
                </Button>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {kpis.map((kpi, i) => (
                    <Card key={i} className="border-none bg-default-50/50 shadow-sm">
                        <CardBody className="flex flex-row items-center gap-4 p-5">
                            <div className={`p-3 rounded-xl bg-${kpi.color}/10`}>
                                {kpi.icon}
                            </div>
                            <div className="flex flex-col">
                                <span className="text-default-500 text-sm font-medium">{kpi.title}</span>
                                <span className="text-2xl font-bold">{kpi.value}</span>
                                <span className="text-tiny text-default-400">{kpi.subtitle}</span>
                            </div>
                        </CardBody>
                    </Card>
                ))}
            </div>

            {/* Main Charts */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* Revenue/Profit Trend */}
                <Card className="lg:col-span-2 border-none shadow-md bg-default-50/20 backdrop-blur-md">
                    <CardHeader className="flex flex-col items-start px-6 pt-6">
                        <h3 className="text-xl font-bold">Performance (30 derniers jours)</h3>
                        <p className="text-default-400 text-sm">Évolution des revenus et des coûts</p>
                    </CardHeader>
                    <CardBody className="px-2 pb-6">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={chartData} margin={{ top: 10, right: 30, left: 0, bottom: 0 }}>
                                    <defs>
                                        <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#ec5b13" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#ec5b13" stopOpacity={0} />
                                        </linearGradient>
                                        <linearGradient id="colorCost" x1="0" y1="0" x2="0" y2="1">
                                            <stop offset="5%" stopColor="#94a3b8" stopOpacity={0.3} />
                                            <stop offset="95%" stopColor="#94a3b8" stopOpacity={0} />
                                        </linearGradient>
                                    </defs>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#333" />
                                    <XAxis
                                        dataKey="date"
                                        tickFormatter={(d) => format(new Date(d), 'dd MMM', { locale: fr })}
                                        stroke="#888"
                                        fontSize={12}
                                    />
                                    <YAxis stroke="#888" fontSize={12} />
                                    <Tooltip
                                        contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                        labelFormatter={(d) => format(new Date(d), 'dd MMMM yyyy', { locale: fr })}
                                    />
                                    <Legend verticalAlign="top" height={36} />
                                    <Area
                                        type="monotone"
                                        dataKey="revenue"
                                        name="Revenu"
                                        stroke="#ec5b13"
                                        fillOpacity={1}
                                        fill="url(#colorRevenue)"
                                        strokeWidth={3}
                                    />
                                    <Area
                                        type="monotone"
                                        dataKey="cost"
                                        name="Coût"
                                        stroke="#94a3b8"
                                        fillOpacity={1}
                                        fill="url(#colorCost)"
                                        strokeWidth={2}
                                        strokeDasharray="5 5"
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    </CardBody>
                </Card>

                {/* Top Products Bar Chart */}
                <Card className="border-none shadow-md bg-default-50/20 backdrop-blur-md">
                    <CardHeader className="flex flex-col items-start px-6 pt-6">
                        <h3 className="text-xl font-bold">Top Produits</h3>
                        <p className="text-default-400 text-sm">Volume de ventes par variante</p>
                    </CardHeader>
                    <CardBody className="px-2 pb-6">
                        <div className="h-[350px] w-full">
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={topProducts.slice(0, 5)} layout="vertical">
                                    <XAxis type="number" hide />
                                    <YAxis
                                        dataKey="productName"
                                        type="category"
                                        width={100}
                                        fontSize={10}
                                        stroke="#888"
                                    />
                                    <Tooltip
                                        cursor={{ fill: 'transparent' }}
                                        contentStyle={{ backgroundColor: '#18181b', border: 'none', borderRadius: '8px', color: '#fff' }}
                                    />
                                    <Bar dataKey="volume" name="Ventes" radius={[0, 4, 4, 0]}>
                                        {topProducts.slice(0, 5).map((entry: any, index: number) => (
                                            <Cell key={`cell-${index}`} fill={index === 0 ? '#ec5b13' : '#3f3f46'} />
                                        ))}
                                    </Bar>
                                </BarChart>
                            </ResponsiveContainer>
                        </div>
                        <div className="mt-4 px-4 flex flex-col gap-2">
                            {topProducts.slice(0, 3).map((p: any, i: number) => (
                                <div key={i} className="flex justify-between items-center text-sm">
                                    <span className="truncate max-w-[150px]">{p.productName}</span>
                                    <Chip size="sm" variant="flat" color={i === 0 ? "warning" : "default"}>
                                        {p.volume} uts
                                    </Chip>
                                </div>
                            ))}
                        </div>
                    </CardBody>
                </Card>
            </div>

            {/* Detailed Tables & IA */}
            <div className="grid grid-cols-1 gap-6 mb-12">
                <Tabs aria-label="Analyses détaillées" variant="underlined" color="warning" classNames={{
                    tabList: "gap-6 w-full relative rounded-none p-0 border-b border-divider",
                    cursor: "w-full bg-orange-500",
                    tab: "max-w-fit px-0 h-12",
                    tabContent: "group-data-[selected=true]:text-orange-500 font-medium"
                }}>
                    <Tab key="clients" title={
                        <div className="flex items-center space-x-2 pb-1">
                            <Users size={18} />
                            <span>Classement Clients</span>
                        </div>
                    }>
                        <Table aria-label="Top Clients" className="mt-4" removeWrapper shadow="none">
                            <TableHeader>
                                <TableColumn>CLIENT</TableColumn>
                                <TableColumn>COMMANDES</TableColumn>
                                <TableColumn>TOTAL DÉPENSÉ</TableColumn>
                                <TableColumn>POINTS FIDÉLITÉ</TableColumn>
                                <TableColumn>ACTION</TableColumn>
                            </TableHeader>
                            <TableBody>
                                {topClients.map((client: any) => (
                                    <TableRow key={client.clientId}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-bold">{client.name}</span>
                                                <span className="text-tiny text-default-400">{client.phone}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{client.orderCount}</TableCell>
                                        <TableCell>
                                            <span className="text-orange-500 font-bold">
                                                {formatCurrency(parseFloat(client.totalSpent))}
                                            </span>
                                        </TableCell>
                                        <TableCell>
                                            <Chip variant="flat" color="warning" size="sm">
                                                {client.points} pts
                                            </Chip>
                                        </TableCell>
                                        <TableCell>
                                            <Button size="sm" variant="light" color="primary">Profil</Button>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Tab>

                    <Tab key="marketing" title={
                        <div className="flex items-center space-x-2 pb-1">
                            <Sparkles size={18} />
                            <span>Conseils Marketing IA</span>
                        </div>
                    }>
                        <div className="mt-6 flex flex-col gap-6">
                            <Card className="bg-orange-500/10 border-orange-500/20 border">
                                <CardBody className="p-6">
                                    <div className="flex flex-col md:flex-row gap-6 items-center">
                                        <div className="p-4 bg-orange-500 rounded-2xl shadow-lg shadow-orange-500/20">
                                            <Lightbulb className="text-white" size={32} />
                                        </div>
                                        <div className="flex-1 text-center md:text-left">
                                            <h3 className="text-xl font-bold text-orange-600 mb-2">Relances Cross-Selling</h3>
                                            <p className="text-default-600">
                                                L'IA analyse vos meilleurs clients et produits pour suggérer des campagnes de fidélisation ciblées.
                                            </p>
                                        </div>
                                        <Button
                                            color="warning"
                                            variant="shadow"
                                            startContent={<Sparkles size={20} />}
                                            onPress={generateAIRecommendations}
                                            isLoading={isGeneratingIA}
                                            className="font-bold"
                                        >
                                            Générer Stratégies
                                        </Button>
                                    </div>
                                </CardBody>
                            </Card>

                            {recommendations ? (
                                <Card className="border-none shadow-sm bg-default-50/50">
                                    <CardHeader className="px-6 pt-6">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-8 bg-orange-500 rounded-full" />
                                            <h3 className="text-lg font-bold uppercase tracking-wider text-default-500">Recommandations de l'IA</h3>
                                        </div>
                                    </CardHeader>
                                    <CardBody className="px-6 pb-6 whitespace-pre-wrap text-default-700 leading-relaxed">
                                        {recommendations}
                                    </CardBody>
                                </Card>
                            ) : (
                                !isGeneratingIA && (
                                    <div className="flex flex-col items-center justify-center p-12 text-default-400 border-2 border-dashed border-default-200 rounded-3xl">
                                        <Sparkles size={48} className="mb-4 opacity-20" />
                                        <p>Cliquez sur le bouton ci-dessus pour lancer l'analyse IA.</p>
                                    </div>
                                )
                            )}
                        </div>
                    </Tab>

                    <Tab key="products" title={
                        <div className="flex items-center space-x-2 pb-1">
                            <Package size={18} />
                            <span>Rentabilité Produits</span>
                        </div>
                    }>
                        <Table aria-label="Détails Ventes Produits" className="mt-4" removeWrapper shadow="none">
                            <TableHeader>
                                <TableColumn>PRODUIT / VARIANTE</TableColumn>
                                <TableColumn>UNITÉS VENDUES</TableColumn>
                                <TableColumn>CA GÉNÉRÉ</TableColumn>
                                <TableColumn>POPULARITÉ</TableColumn>
                            </TableHeader>
                            <TableBody>
                                {topProducts.map((p: any) => (
                                    <TableRow key={p.productId + p.variantName}>
                                        <TableCell>
                                            <div className="flex flex-col">
                                                <span className="font-medium">{p.productName}</span>
                                                <span className="text-tiny text-default-400">{p.variantName}</span>
                                            </div>
                                        </TableCell>
                                        <TableCell>{p.volume}</TableCell>
                                        <TableCell>
                                            {formatCurrency(parseFloat(p.revenue))}
                                        </TableCell>
                                        <TableCell>
                                            <div className="flex items-center gap-2">
                                                <div className="w-24 h-2 bg-default-100 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full bg-orange-500"
                                                        style={{ width: `${Math.min((p.volume / topProducts[0].volume) * 100, 100)}%` }}
                                                    />
                                                </div>
                                                <span className="text-tiny text-default-400">
                                                    {Math.round((p.volume / topProducts[0].volume) * 100)}%
                                                </span>
                                            </div>
                                        </TableCell>
                                    </TableRow>
                                ))}
                            </TableBody>
                        </Table>
                    </Tab>
                </Tabs>
            </div>
        </div>
    );
}
