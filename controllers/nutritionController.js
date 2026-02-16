/**
 * Contrôleur pour les statistiques nutritionnelles
 */
const asyncHandler = require('express-async-handler');
const { Op, fn, col, literal } = require('sequelize');
const { Commande, CommandeItem, Plat, User } = require('../models');

/**
 * @desc    Obtenir le résumé nutritionnel par période
 * @route   GET /api/nutrition/summary
 * @access  Private (client)
 */
const getNutritionSummary = asyncHandler(async (req, res) => {
    const clientId = req.user.id;
    const { period = 'week' } = req.query; // week, month, year

    let startDate = new Date();
    if (period === 'week') {
        startDate.setDate(startDate.getDate() - 7);
    } else if (period === 'month') {
        startDate.setMonth(startDate.getMonth() - 1);
    } else if (period === 'year') {
        startDate.setFullYear(startDate.getFullYear() - 1);
    }

    const orders = await Commande.findAll({
        where: {
            clientId,
            statut: 'livree',
            createdAt: { [Op.gte]: startDate },
        },
        include: [
            {
                model: CommandeItem,
                as: 'items',
                include: [
                    {
                        model: Plat,
                        as: 'plat',
                        attributes: ['id', 'nom', 'calories', 'proteines', 'glucides', 'lipides', 'fibres'],
                    },
                ],
            },
        ],
    });

    // Calculer les totaux
    let totalCalories = 0;
    let totalProteines = 0;
    let totalGlucides = 0;
    let totalLipides = 0;
    let totalFibres = 0;
    let totalMeals = 0;

    for (const order of orders) {
        for (const item of order.items || []) {
            if (item.plat) {
                const qty = item.quantite || 1;
                totalCalories += (item.plat.calories || 0) * qty;
                totalProteines += parseFloat(item.plat.proteines || 0) * qty;
                totalGlucides += parseFloat(item.plat.glucides || 0) * qty;
                totalLipides += parseFloat(item.plat.lipides || 0) * qty;
                totalFibres += parseFloat(item.plat.fibres || 0) * qty;
                totalMeals += qty;
            }
        }
    }

    // Moyennes journalières
    const days = period === 'week' ? 7 : period === 'month' ? 30 : 365;
    const avgCaloriesPerDay = Math.round(totalCalories / days);
    const avgProteinesPerDay = Math.round(totalProteines / days * 10) / 10;
    const avgGlucidesPerDay = Math.round(totalGlucides / days * 10) / 10;
    const avgLipidesPerDay = Math.round(totalLipides / days * 10) / 10;

    res.json({
        success: true,
        data: {
            period,
            days,
            totals: {
                calories: totalCalories,
                proteines: Math.round(totalProteines * 10) / 10,
                glucides: Math.round(totalGlucides * 10) / 10,
                lipides: Math.round(totalLipides * 10) / 10,
                fibres: Math.round(totalFibres * 10) / 10,
                meals: totalMeals,
            },
            averages: {
                caloriesPerDay: avgCaloriesPerDay,
                proteinesPerDay: avgProteinesPerDay,
                glucidesPerDay: avgGlucidesPerDay,
                lipidesPerDay: avgLipidesPerDay,
            },
            orders: orders.length,
        },
    });
});

/**
 * @desc    Obtenir le calendrier nutritionnel
 * @route   GET /api/nutrition/calendar
 * @access  Private (client)
 */
const getNutritionCalendar = asyncHandler(async (req, res) => {
    const clientId = req.user.id;
    const { year, month } = req.query;

    const targetYear = parseInt(year) || new Date().getFullYear();
    const targetMonth = parseInt(month) || new Date().getMonth() + 1;

    const startDate = new Date(targetYear, targetMonth - 1, 1);
    const endDate = new Date(targetYear, targetMonth, 0, 23, 59, 59);

    const orders = await Commande.findAll({
        where: {
            clientId,
            statut: 'livree',
            createdAt: {
                [Op.gte]: startDate,
                [Op.lte]: endDate,
            },
        },
        include: [
            {
                model: CommandeItem,
                as: 'items',
                include: [
                    {
                        model: Plat,
                        as: 'plat',
                        attributes: ['id', 'nom', 'calories', 'proteines', 'glucides', 'lipides', 'image'],
                    },
                ],
            },
            {
                model: User,
                as: 'prestataire',
                attributes: ['id', 'nom'],
            },
        ],
        order: [['createdAt', 'ASC']],
    });

    // Grouper par jour
    const calendarData = {};

    for (const order of orders) {
        const dateKey = order.createdAt.toISOString().split('T')[0];

        if (!calendarData[dateKey]) {
            calendarData[dateKey] = {
                date: dateKey,
                meals: [],
                totals: { calories: 0, proteines: 0, glucides: 0, lipides: 0 },
            };
        }

        for (const item of order.items || []) {
            if (item.plat) {
                const qty = item.quantite || 1;
                calendarData[dateKey].meals.push({
                    platId: item.plat.id,
                    nom: item.plat.nom?.fr || item.plat.nom,
                    image: item.plat.image,
                    quantite: qty,
                    calories: (item.plat.calories || 0) * qty,
                    restaurant: order.prestataire?.nom,
                });
                calendarData[dateKey].totals.calories += (item.plat.calories || 0) * qty;
                calendarData[dateKey].totals.proteines += parseFloat(item.plat.proteines || 0) * qty;
                calendarData[dateKey].totals.glucides += parseFloat(item.plat.glucides || 0) * qty;
                calendarData[dateKey].totals.lipides += parseFloat(item.plat.lipides || 0) * qty;
            }
        }
    }

    // Arrondir les totaux
    Object.values(calendarData).forEach(day => {
        day.totals.proteines = Math.round(day.totals.proteines * 10) / 10;
        day.totals.glucides = Math.round(day.totals.glucides * 10) / 10;
        day.totals.lipides = Math.round(day.totals.lipides * 10) / 10;
    });

    res.json({
        success: true,
        data: {
            year: targetYear,
            month: targetMonth,
            daysInMonth: new Date(targetYear, targetMonth, 0).getDate(),
            calendar: calendarData,
        },
    });
});

/**
 * @desc    Obtenir les tendances nutritionnelles
 * @route   GET /api/nutrition/trends
 * @access  Private (client)
 */
const getNutritionTrends = asyncHandler(async (req, res) => {
    const clientId = req.user.id;
    const weeks = parseInt(req.query.weeks) || 4;

    const trends = [];
    const now = new Date();

    for (let i = 0; i < weeks; i++) {
        const weekEnd = new Date(now);
        weekEnd.setDate(weekEnd.getDate() - (i * 7));
        const weekStart = new Date(weekEnd);
        weekStart.setDate(weekStart.getDate() - 7);

        const orders = await Commande.findAll({
            where: {
                clientId,
                statut: 'livree',
                createdAt: {
                    [Op.gte]: weekStart,
                    [Op.lt]: weekEnd,
                },
            },
            include: [
                {
                    model: CommandeItem,
                    as: 'items',
                    include: [
                        {
                            model: Plat,
                            as: 'plat',
                            attributes: ['calories', 'proteines', 'glucides', 'lipides'],
                        },
                    ],
                },
            ],
        });

        let weekCalories = 0;
        let weekMeals = 0;

        for (const order of orders) {
            for (const item of order.items || []) {
                if (item.plat) {
                    weekCalories += (item.plat.calories || 0) * (item.quantite || 1);
                    weekMeals += item.quantite || 1;
                }
            }
        }

        trends.unshift({
            weekNumber: weeks - i,
            startDate: weekStart.toISOString().split('T')[0],
            endDate: weekEnd.toISOString().split('T')[0],
            totalCalories: weekCalories,
            avgCaloriesPerDay: Math.round(weekCalories / 7),
            meals: weekMeals,
        });
    }

    res.json({
        success: true,
        data: { trends },
    });
});

module.exports = {
    getNutritionSummary,
    getNutritionCalendar,
    getNutritionTrends,
};
