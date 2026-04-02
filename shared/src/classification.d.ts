export type ActivityCategory = 'core_work' | 'communication' | 'research_learning' | 'planning_docs' | 'break_idle' | 'entertainment' | 'social_media' | 'shopping_personal' | 'other';
export type ProductivityLevel = 'productive' | 'neutral' | 'unproductive' | 'idle';
export interface ActivityClassification {
    category: ActivityCategory;
    categoryName: string;
    productivityScore: number;
    productivityLevel: ProductivityLevel;
    isSuspicious: boolean;
    suspiciousReason?: string;
    isIdle: boolean;
}
export declare const PRODUCTIVITY_SCORES: Record<ActivityCategory, number>;
export declare const CATEGORY_NAMES: Record<ActivityCategory, string>;
export declare const PRODUCTIVITY_LEVELS: Record<ActivityCategory, ProductivityLevel>;
interface AppRule {
    patterns: string[];
    category: ActivityCategory;
    exceptions?: string[];
}
export declare const APP_CLASSIFICATION_RULES: AppRule[];
export interface SuspiciousPattern {
    type: 'video_idle' | 'communication_ghost' | 'rapid_switching' | 'fake_active' | 'long_idle';
    description: string;
    threshold: number;
}
export declare const SUSPICIOUS_THRESHOLDS: {
    videoIdleMinutes: number;
    communicationGhostMinutes: number;
    rapidSwitchSeconds: number;
    idleThresholdMinutes: number;
    sameWindowMinutes: number;
};
export declare function classifyActivity(appName: string, windowTitle: string, context?: {
    durationMinutes?: number;
    hasInputActivity?: boolean;
    windowChangeCount?: number;
    lastInputMinutesAgo?: number;
    isVideoPlaying?: boolean;
    isFullscreen?: boolean;
}): ActivityClassification;
export declare function calculateTrueProductivity(activities: Array<{
    category: ActivityCategory;
    duration: number;
    isIdle: boolean;
    isSuspicious: boolean;
}>): {
    productiveMinutes: number;
    idleMinutes: number;
    unproductiveMinutes: number;
    totalMinutes: number;
    productivityPercentage: number;
};
export declare function detectGamingAttempts(activities: Array<{
    appName: string;
    windowTitle: string;
    duration: number;
    hasInputActivity?: boolean;
}>): Array<{
    type: string;
    description: string;
    severity: 'low' | 'medium' | 'high';
}>;
export declare function generateDailySummary(employeeId: string, activities: Array<{
    category: ActivityCategory;
    duration: number;
    isIdle: boolean;
    isSuspicious: boolean;
    appName: string;
    windowTitle: string;
}>): {
    employeeId: string;
    totalHours: number;
    productiveHours: number;
    idleHours: number;
    unproductiveHours: number;
    productivityScore: number;
    suspiciousActivities: number;
    topApps: Array<{
        name: string;
        hours: number;
        category: ActivityCategory;
    }>;
    warnings: string[];
};
export {};
