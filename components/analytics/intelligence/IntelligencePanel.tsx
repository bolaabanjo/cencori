'use client';

import { useState } from 'react';
import { ModelEfficiencyPanel } from './ModelEfficiencyPanel';

interface IntelligencePanelProps {
    projectId: string;
    environment: 'production' | 'test';
}

export function IntelligencePanel({ projectId, environment }: IntelligencePanelProps) {
    const [timeRange, setTimeRange] = useState('30d');

    return (
        <div>
            <div className="mb-4">
                <h2 className="text-sm font-medium">Intelligence</h2>
                <p className="text-xs text-muted-foreground mt-0.5">
                    Grounded analysis and model efficiency evidence for your workload.
                </p>
            </div>

            <div className="space-y-4">
                <ModelEfficiencyPanel
                    projectId={projectId}
                    environment={environment}
                    timeRange={timeRange}
                    onTimeRangeChange={setTimeRange}
                />
            </div>
        </div>
    );
}
