import React from 'react';
import { Box, Card, CardContent, Typography, LinearProgress } from '@mui/material';

interface StatsCardProps {
  title: string;
  value: string | number;
  subtitle?: string;
  icon?: React.ReactNode;
  color?: string;
  progress?: number;
  trend?: { positive: boolean; value: number; label: string };
}

function StatsCard({ title, value, subtitle, icon, color = 'primary', progress, trend }: StatsCardProps) {
  return (
    <Card sx={{ height: '100%' }}>
      <CardContent sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
          <Box>
            <Typography variant="body2" sx={{ color: 'text.secondary', fontWeight: 500, mb: 0.5 }}>
              {title}
            </Typography>
            <Typography variant="h4" sx={{ fontWeight: 700, color: 'text.primary' }}>
              {value}
            </Typography>
            {subtitle && (
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>
                {subtitle}
              </Typography>
            )}
          </Box>
          {icon && (
            <Box
              sx={{
                width: 48, height: 48, borderRadius: 2,
                backgroundColor: `${color}.light`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: `${color}.main`,
              }}
            >
              {icon}
            </Box>
          )}
        </Box>

        {progress !== undefined && (
          <Box sx={{ mt: 2 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="caption" sx={{ color: 'text.secondary' }}>Progress</Typography>
              <Typography variant="caption" sx={{ color: 'text.secondary', fontWeight: 600 }}>{progress}%</Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={progress}
              sx={{
                height: 6, borderRadius: 3, backgroundColor: 'action.hover',
                '& .MuiLinearProgress-bar': { borderRadius: 3, backgroundColor: `${color}.main` },
              }}
            />
          </Box>
        )}

        {trend && (
          <Box sx={{ mt: 1, display: 'flex', alignItems: 'center', gap: 0.5 }}>
            <Typography variant="caption" sx={{ color: trend.positive ? 'success.main' : 'error.main', fontWeight: 600 }}>
              {trend.positive ? '+' : ''}{trend.value}%
            </Typography>
            <Typography variant="caption" sx={{ color: 'text.secondary' }}>{trend.label}</Typography>
          </Box>
        )}
      </CardContent>
    </Card>
  );
}

export default StatsCard;
