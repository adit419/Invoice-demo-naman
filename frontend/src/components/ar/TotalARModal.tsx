import { X, DollarSign, Download, Filter, Search, ChevronDown, ChevronUp, ChevronsUpDown } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { useState, useMemo } from 'react';

interface TotalARModalProps {
  onClose: () => void;
}

interface Invoice {
  id: string;
  customer: string;
  amount: number;
  dueDate: string;
  aging: string;
  status: string;
  geography: string;
  collector: string;
  currency: string;
}

type SortField = 'id' | 'customer' | 'amount' | 'dueDate' | 'aging' | 'status' | 'geography' | 'collector' | 'currency';
type SortDirection = 'asc' | 'desc' | null;

export function TotalARModal({ onClose }: TotalARModalProps) {
  const [showFilters, setShowFilters] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [sortField, setSortField] = useState<SortField | null>(null);
  const [sortDirection, setSortDirection] = useState<SortDirection>(null);
  const [filters, setFilters] = useState({
    customer: [] as string[],
    geography: [] as string[],
    collector: [] as string[],
    currency: [] as string[],
    aging: [] as string[],
    status: [] as string[],
  });

  const agingBreakdown = [
    { bucket: 'Current', amount: 1765000, percentage: 72.0, color: '#10b981' },
    { bucket: '1-30 days', amount: 425000, percentage: 17.3, color: '#fbbf24' },
    { bucket: '31-60 days', amount: 165000, percentage: 6.7, color: '#f97316' },
    { bucket: '61-90 days', amount: 65000, percentage: 2.7, color: '#ef4444' },
    { bucket: '90+ days', amount: 30000, percentage: 1.3, color: '#dc2626' },
  ];

  const allInvoices: Invoice[] = [
    // 90+ days - 15 invoices
    { id: 'INV-10101', customer: 'Mega Corp Industries', amount: 4200, dueDate: '2024-08-15', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10102', customer: 'Quality Partners LLC', amount: 2800, dueDate: '2024-09-20', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10103', customer: 'Legacy Systems Inc', amount: 1900, dueDate: '2024-09-05', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10104', customer: 'Vintage Industries', amount: 3100, dueDate: '2024-08-28', aging: '90+ days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'USD' },
    { id: 'INV-10105', customer: 'Classic Trading Co', amount: 2500, dueDate: '2024-09-12', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10106', customer: 'Heritage Products', amount: 1800, dueDate: '2024-09-18', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10107', customer: 'Traditional Supplies', amount: 2200, dueDate: '2024-08-22', aging: '90+ days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10108', customer: 'Timeless Solutions', amount: 1600, dueDate: '2024-09-08', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10109', customer: 'Established Corp', amount: 2900, dueDate: '2024-09-15', aging: '90+ days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10110', customer: 'Pioneer Trading', amount: 1500, dueDate: '2024-08-30', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10111', customer: 'Foundation Industries', amount: 1700, dueDate: '2024-09-10', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10112', customer: 'Original Partners', amount: 1400, dueDate: '2024-09-22', aging: '90+ days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10113', customer: 'Historic Distributors', amount: 1200, dueDate: '2024-08-25', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10114', customer: 'Senior Solutions', amount: 1100, dueDate: '2024-09-17', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10115', customer: 'Veteran Supplies', amount: 1000, dueDate: '2024-09-03', aging: '90+ days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    
    // 61-90 days - 20 invoices
    { id: 'INV-10201', customer: 'Tech Solutions Inc', amount: 5200, dueDate: '2024-10-20', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10202', customer: 'ABC Manufacturing Ltd', amount: 4800, dueDate: '2024-10-15', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10203', customer: 'Precision Tools Inc', amount: 3900, dueDate: '2024-10-18', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10204', customer: 'Industrial Components', amount: 3400, dueDate: '2024-10-22', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10205', customer: 'Machine Works Ltd', amount: 2900, dueDate: '2024-10-12', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10206', customer: 'Equipment Rentals', amount: 3700, dueDate: '2024-10-25', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10207', customer: 'Assembly Systems', amount: 3200, dueDate: '2024-10-17', aging: '61-90 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10208', customer: 'Automation Corp', amount: 2800, dueDate: '2024-10-14', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10209', customer: 'Process Solutions', amount: 4100, dueDate: '2024-10-21', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10210', customer: 'Mechanical Services', amount: 2600, dueDate: '2024-10-19', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10211', customer: 'Fabrication Inc', amount: 3500, dueDate: '2024-10-16', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10212', customer: 'Engineering Group', amount: 2700, dueDate: '2024-10-23', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10213', customer: 'Technical Resources', amount: 4300, dueDate: '2024-10-13', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10214', customer: 'Production Systems', amount: 3100, dueDate: '2024-10-24', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10215', customer: 'Manufacturing Hub', amount: 2500, dueDate: '2024-10-11', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10216', customer: 'Industrial Supply', amount: 3600, dueDate: '2024-10-26', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10217', customer: 'Operations Center', amount: 2400, dueDate: '2024-10-27', aging: '61-90 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10218', customer: 'Maintenance Pro', amount: 2200, dueDate: '2024-10-10', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10219', customer: 'Quality Control Inc', amount: 2000, dueDate: '2024-10-28', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10220', customer: 'Workshop Solutions', amount: 1800, dueDate: '2024-10-09', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    
    // 31-60 days - 25 invoices
    { id: 'INV-10301', customer: 'Global Retail Corp', amount: 8900, dueDate: '2024-11-05', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10302', customer: 'ABC Manufacturing Ltd', amount: 7200, dueDate: '2024-11-01', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10303', customer: 'Metro Supplies Ltd', amount: 6800, dueDate: '2024-10-28', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10304', customer: 'Coastal Distributors', amount: 7500, dueDate: '2024-10-30', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10305', customer: 'Valley Electronics', amount: 6400, dueDate: '2024-11-02', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10306', customer: 'Urban Systems', amount: 5900, dueDate: '2024-11-04', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10307', customer: 'Regional Partners', amount: 7100, dueDate: '2024-10-29', aging: '31-60 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10308', customer: 'District Trading', amount: 6700, dueDate: '2024-11-03', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10309', customer: 'Provincial Corp', amount: 5800, dueDate: '2024-10-31', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10310', customer: 'Territory Sales', amount: 6200, dueDate: '2024-11-06', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10311', customer: 'Local Ventures', amount: 7300, dueDate: '2024-10-27', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10312', customer: 'Community Services', amount: 5600, dueDate: '2024-11-07', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP' },
    { id: 'INV-10313', customer: 'Municipal Supply', amount: 6900, dueDate: '2024-11-08', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10314', customer: 'County Resources', amount: 6500, dueDate: '2024-10-26', aging: '31-60 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10315', customer: 'Township Industries', amount: 5400, dueDate: '2024-11-09', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10316', customer: 'Village Trading', amount: 7600, dueDate: '2024-10-25', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10317', customer: 'Suburb Solutions', amount: 6100, dueDate: '2024-11-10', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10318', customer: 'Downtown Corp', amount: 5700, dueDate: '2024-10-24', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10319', customer: 'Uptown Partners', amount: 6600, dueDate: '2024-11-11', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10320', customer: 'Midtown Services', amount: 7400, dueDate: '2024-10-23', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10321', customer: 'Eastside Trading', amount: 5500, dueDate: '2024-11-12', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10322', customer: 'Westside Industries', amount: 6300, dueDate: '2024-10-22', aging: '31-60 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10323', customer: 'Northside Corp', amount: 7000, dueDate: '2024-11-13', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10324', customer: 'Southside Partners', amount: 5300, dueDate: '2024-10-21', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10325', customer: 'Central Business', amount: 6000, dueDate: '2024-11-14', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    
    // 1-30 days - 30 invoices
    { id: 'INV-10401', customer: 'Premium Distributors', amount: 18500, dueDate: '2024-11-15', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10402', customer: 'Summit Corporation', amount: 16200, dueDate: '2024-11-10', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10403', customer: 'Alpine Industries', amount: 15800, dueDate: '2024-11-12', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10404', customer: 'Riverside Partners', amount: 14900, dueDate: '2024-11-08', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10405', customer: 'Northwest Trading', amount: 13400, dueDate: '2024-11-14', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10406', customer: 'Pacific Ventures', amount: 17600, dueDate: '2024-11-11', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10407', customer: 'Mountain Corp', amount: 12700, dueDate: '2024-11-09', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10408', customer: 'Ocean Industries', amount: 15300, dueDate: '2024-11-13', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10409', customer: 'Forest Solutions', amount: 11900, dueDate: '2024-11-16', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10410', customer: 'Desert Trading', amount: 14200, dueDate: '2024-11-07', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10411', customer: 'Prairie Partners', amount: 13800, dueDate: '2024-11-17', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP' },
    { id: 'INV-10412', customer: 'Lake Systems', amount: 16500, dueDate: '2024-11-06', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10413', customer: 'River Corp', amount: 12300, dueDate: '2024-11-18', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10414', customer: 'Canyon Industries', amount: 15700, dueDate: '2024-11-05', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10415', customer: 'Valley Ventures', amount: 11500, dueDate: '2024-11-19', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10416', customer: 'Highland Trading', amount: 14600, dueDate: '2024-11-04', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10417', customer: 'Lowland Partners', amount: 13100, dueDate: '2024-11-20', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10418', customer: 'Plateau Corp', amount: 12800, dueDate: '2024-11-03', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10419', customer: 'Basin Industries', amount: 16900, dueDate: '2024-11-21', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10420', customer: 'Ridge Solutions', amount: 11200, dueDate: '2024-11-02', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10421', customer: 'Peak Trading', amount: 15400, dueDate: '2024-11-22', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10422', customer: 'Summit Partners', amount: 13600, dueDate: '2024-11-01', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10423', customer: 'Crest Corp', amount: 12100, dueDate: '2024-11-23', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10424', customer: 'Crown Industries', amount: 14800, dueDate: '2024-10-31', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10425', customer: 'Apex Ventures', amount: 11700, dueDate: '2024-11-24', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10426', customer: 'Zenith Trading', amount: 13900, dueDate: '2024-10-30', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10427', customer: 'Pinnacle Partners', amount: 12600, dueDate: '2024-11-25', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10428', customer: 'Vertex Corp', amount: 15100, dueDate: '2024-10-29', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10429', customer: 'Acme Industries', amount: 11400, dueDate: '2024-11-26', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10430', customer: 'Zenith Solutions', amount: 13300, dueDate: '2024-10-28', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    
    // Current - 50 invoices
    { id: 'INV-10501', customer: 'Smart Systems Co', amount: 38200, dueDate: '2024-11-28', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10502', customer: 'Horizon Technologies', amount: 42500, dueDate: '2024-12-05', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10503', customer: 'Enterprise Solutions', amount: 39800, dueDate: '2024-12-08', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10504', customer: 'Global Systems Inc', amount: 36700, dueDate: '2024-12-10', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10505', customer: 'Dynamic Corp', amount: 34200, dueDate: '2024-12-12', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10506', customer: 'Integrated Networks', amount: 41900, dueDate: '2024-12-15', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10507', customer: 'Superior Products', amount: 33800, dueDate: '2024-12-18', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10508', customer: 'Advanced Manufacturing', amount: 37600, dueDate: '2024-12-20', aging: 'Current', status: 'Current', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10509', customer: 'Premier Services', amount: 35400, dueDate: '2024-12-22', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10510', customer: 'Capital Industries', amount: 32900, dueDate: '2024-12-25', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10511', customer: 'United Distributors', amount: 38700, dueDate: '2024-12-28', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10512', customer: 'Frontier Technologies', amount: 31500, dueDate: '2024-12-30', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10513', customer: 'Nexus Corporation', amount: 36100, dueDate: '2024-12-02', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10514', customer: 'Infinity Systems', amount: 34600, dueDate: '2024-12-04', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10515', customer: 'Quantum Industries', amount: 39300, dueDate: '2024-12-06', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10516', customer: 'Stellar Partners', amount: 32100, dueDate: '2024-12-09', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP' },
    { id: 'INV-10517', customer: 'Cosmic Trading', amount: 37200, dueDate: '2024-12-11', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10518', customer: 'Universal Corp', amount: 35800, dueDate: '2024-12-13', aging: 'Current', status: 'Current', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10519', customer: 'Galactic Solutions', amount: 33400, dueDate: '2024-12-16', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10520', customer: 'Nova Industries', amount: 38900, dueDate: '2024-12-19', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10521', customer: 'Meteor Ventures', amount: 31800, dueDate: '2024-12-21', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10522', customer: 'Eclipse Trading', amount: 36400, dueDate: '2024-12-23', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10523', customer: 'Orbit Partners', amount: 34900, dueDate: '2024-12-26', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10524', customer: 'Comet Corp', amount: 32600, dueDate: '2024-12-29', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10525', customer: 'Satellite Systems', amount: 37800, dueDate: '2024-12-31', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10526', customer: 'Astro Industries', amount: 35200, dueDate: '2024-12-01', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10527', customer: 'Celestial Solutions', amount: 33700, dueDate: '2024-12-03', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10528', customer: 'Lunar Trading', amount: 38400, dueDate: '2024-12-07', aging: 'Current', status: 'Current', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10529', customer: 'Solar Partners', amount: 31200, dueDate: '2024-12-14', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10530', customer: 'Interstellar Corp', amount: 36800, dueDate: '2024-12-17', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10531', customer: 'Nebula Industries', amount: 34300, dueDate: '2024-12-24', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10532', customer: 'Constellation Ventures', amount: 39600, dueDate: '2024-12-27', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10533', customer: 'Galaxy Trading', amount: 32400, dueDate: '2024-11-29', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10534', customer: 'Cosmos Solutions', amount: 37100, dueDate: '2024-11-30', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10535', customer: 'Starlight Partners', amount: 35600, dueDate: '2024-12-02', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10536', customer: 'Rocket Industries', amount: 33200, dueDate: '2024-12-04', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP' },
    { id: 'INV-10537', customer: 'Spaceship Corp', amount: 38100, dueDate: '2024-12-06', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10538', customer: 'Voyager Trading', amount: 31900, dueDate: '2024-12-09', aging: 'Current', status: 'Current', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10539', customer: 'Explorer Ventures', amount: 36600, dueDate: '2024-12-11', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10540', customer: 'Discovery Partners', amount: 34700, dueDate: '2024-12-13', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR' },
    { id: 'INV-10541', customer: 'Pioneer Systems', amount: 32800, dueDate: '2024-12-16', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10542', customer: 'Navigator Industries', amount: 37400, dueDate: '2024-12-19', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
    { id: 'INV-10543', customer: 'Pathfinder Solutions', amount: 35900, dueDate: '2024-12-21', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10544', customer: 'Trailblazer Trading', amount: 33600, dueDate: '2024-12-23', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD' },
    { id: 'INV-10545', customer: 'Adventurer Corp', amount: 38600, dueDate: '2024-12-26', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD' },
    { id: 'INV-10546', customer: 'Wanderer Partners', amount: 31600, dueDate: '2024-12-28', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP' },
    { id: 'INV-10547', customer: 'Nomad Industries', amount: 36900, dueDate: '2024-12-30', aging: 'Current', status: 'Current', geography: 'North America', collector: 'Robert Wilson', currency: 'USD' },
    { id: 'INV-10548', customer: 'Roamer Ventures', amount: 34500, dueDate: '2024-12-01', aging: 'Current', status: 'Current', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD' },
    { id: 'INV-10549', customer: 'Traveler Solutions', amount: 32300, dueDate: '2024-12-03', aging: 'Current', status: 'Current', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD' },
    { id: 'INV-10550', customer: 'Journey Trading', amount: 37700, dueDate: '2024-12-05', aging: 'Current', status: 'Current', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR' },
  ];

  // Get unique values for filters
  const uniqueGeographies = Array.from(new Set(allInvoices.map(inv => inv.geography)));
  const uniqueCollectors = Array.from(new Set(allInvoices.map(inv => inv.collector)));
  const uniqueCurrencies = Array.from(new Set(allInvoices.map(inv => inv.currency)));
  const uniqueAgingBuckets = Array.from(new Set(allInvoices.map(inv => inv.aging)));
  const uniqueStatuses = Array.from(new Set(allInvoices.map(inv => inv.status)));

  // Filter invoices based on search and filters
  const filteredInvoices = useMemo(() => {
    return allInvoices.filter((invoice) => {
      // Search filter
      const searchLower = searchQuery.toLowerCase();
      const matchesSearch = 
        invoice.id.toLowerCase().includes(searchLower) ||
        invoice.customer.toLowerCase().includes(searchLower) ||
        invoice.geography.toLowerCase().includes(searchLower) ||
        invoice.collector.toLowerCase().includes(searchLower) ||
        invoice.currency.toLowerCase().includes(searchLower);

      if (!matchesSearch) return false;

      // Apply filters
      if (filters.customer.length > 0 && !filters.customer.includes(invoice.customer)) return false;
      if (filters.geography.length > 0 && !filters.geography.includes(invoice.geography)) return false;
      if (filters.collector.length > 0 && !filters.collector.includes(invoice.collector)) return false;
      if (filters.currency.length > 0 && !filters.currency.includes(invoice.currency)) return false;
      if (filters.aging.length > 0 && !filters.aging.includes(invoice.aging)) return false;
      if (filters.status.length > 0 && !filters.status.includes(invoice.status)) return false;

      return true;
    });
  }, [searchQuery, filters]);

  const toggleFilter = (category: keyof typeof filters, value: string) => {
    setFilters(prev => ({
      ...prev,
      [category]: prev[category].includes(value)
        ? prev[category].filter(v => v !== value)
        : [...prev[category], value]
    }));
  };

  const clearFilters = () => {
    setFilters({
      customer: [],
      geography: [],
      collector: [],
      currency: [],
      aging: [],
      status: [],
    });
  };

  const activeFiltersCount = Object.values(filters).reduce((sum, arr) => sum + arr.length, 0);

  const total = agingBreakdown.reduce((sum, item) => sum + item.amount, 0);

  const sortInvoices = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedInvoices = useMemo(() => {
    if (!sortField || !sortDirection) return filteredInvoices;
    return [...filteredInvoices].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        return sortDirection === 'asc' ? aValue - bValue : bValue - aValue;
      }
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        return sortDirection === 'asc' ? aValue.localeCompare(bValue) : bValue.localeCompare(aValue);
      }
      return 0;
    });
  }, [filteredInvoices, sortField, sortDirection]);

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div className="bg-white rounded-xl max-w-7xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="sticky top-0 bg-white border-b border-slate-200 p-6 flex items-center justify-between z-10">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-cyan-600 rounded-lg flex items-center justify-center">
              <DollarSign className="w-6 h-6 text-white" />
            </div>
            <div>
              <h2 className="text-slate-900">Total Accounts Receivable</h2>
              <p className="text-sm text-slate-500">Complete breakdown and invoice details</p>
            </div>
          </div>
          <button 
            onClick={onClose}
            className="w-10 h-10 rounded-lg hover:bg-slate-100 flex items-center justify-center transition-colors"
          >
            <X className="w-5 h-5 text-slate-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gradient-to-br from-blue-50 to-cyan-50 rounded-lg p-4 border border-blue-200">
              <p className="text-sm text-blue-700">Total AR</p>
              <p className="text-slate-900 mt-1">${total.toLocaleString()}</p>
            </div>
            <div className="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200">
              <p className="text-sm text-green-700">Current (Not Due)</p>
              <p className="text-slate-900 mt-1">${agingBreakdown[0].amount.toLocaleString()}</p>
              <p className="text-xs text-green-600 mt-1">{agingBreakdown[0].percentage}% of total</p>
            </div>
            <div className="bg-gradient-to-br from-red-50 to-orange-50 rounded-lg p-4 border border-red-200">
              <p className="text-sm text-red-700">Past Due</p>
              <p className="text-slate-900 mt-1">${(total - agingBreakdown[0].amount).toLocaleString()}</p>
              <p className="text-xs text-red-600 mt-1">{(100 - agingBreakdown[0].percentage).toFixed(1)}% of total</p>
            </div>
          </div>

          {/* Aging Breakdown */}
          <div className="bg-slate-50 rounded-lg p-6 border border-slate-200">
            <h3 className="text-slate-900 mb-4">Aging Breakdown</h3>
            <div className="space-y-3">
              {agingBreakdown.map((item) => (
                <div key={item.bucket} className="flex items-center gap-4">
                  <div className="w-32 text-sm text-slate-700">{item.bucket}</div>
                  <div className="flex-1">
                    <div className="w-full bg-slate-200 rounded-full h-8 relative overflow-hidden">
                      <div 
                        className="h-full flex items-center justify-end px-3 text-white text-sm transition-all"
                        style={{ 
                          width: `${item.percentage}%`,
                          backgroundColor: item.color,
                          minWidth: '80px'
                        }}
                      >
                        {item.percentage}%
                      </div>
                    </div>
                  </div>
                  <div className="w-32 text-right text-slate-900">
                    ${(item.amount / 1000).toFixed(0)}K
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Chart */}
          <div className="bg-white rounded-lg p-6 border border-slate-200">
            <h3 className="text-slate-900 mb-4">Visual Distribution</h3>
            <ResponsiveContainer width="100%" height={250}>
              <BarChart data={agingBreakdown}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                <XAxis dataKey="bucket" stroke="#64748b" />
                <YAxis 
                  stroke="#64748b"
                  tickFormatter={(value: number) => `$${((value as number) / 1000).toFixed(0)}K`}
                />
                <Tooltip 
                  formatter={(value: unknown) => `$${(value as number).toLocaleString()}`}
                  contentStyle={{ background: '#fff', border: '1px solid #e2e8f0', borderRadius: '8px' }}
                />
                <Bar dataKey="amount" radius={[8, 8, 0, 0]}>
                  {agingBreakdown.map((entry, index) => (
                    <Cell key={`bar-${index}`} fill={entry.color} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          {/* Invoice List */}
          <div className="bg-white rounded-lg border border-slate-200">
            <div className="p-4 border-b border-slate-200">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-slate-900">All Invoices ({filteredInvoices.length})</h3>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      placeholder="Search..."
                      className="pl-9 pr-4 py-2 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                    />
                  </div>
                  <button 
                    onClick={() => setShowFilters(!showFilters)}
                    className={`flex items-center gap-2 px-3 py-2 border rounded-lg transition-colors text-sm ${
                      showFilters || activeFiltersCount > 0
                        ? 'bg-blue-50 border-blue-500 text-blue-700'
                        : 'border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Filter className="w-4 h-4" />
                    Filters
                    {activeFiltersCount > 0 && (
                      <span className="bg-blue-600 text-white rounded-full px-2 py-0.5 text-xs">
                        {activeFiltersCount}
                      </span>
                    )}
                  </button>
                  <button className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm">
                    <Download className="w-4 h-4" />
                    Export
                  </button>
                </div>
              </div>

              {/* Filter Panel */}
              {showFilters && (
                <div className="bg-slate-50 rounded-lg p-4 border border-slate-200 space-y-4">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm text-slate-600">Filter by:</p>
                    {activeFiltersCount > 0 && (
                      <button
                        onClick={clearFilters}
                        className="text-sm text-blue-600 hover:text-blue-700"
                      >
                        Clear all
                      </button>
                    )}
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-5 gap-4">
                    {/* Customer Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Customer</label>
                      <div className="space-y-2">
                        {Array.from(new Set(allInvoices.map(inv => inv.customer))).map((customer) => (
                          <label key={customer} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.customer.includes(customer)}
                              onChange={() => toggleFilter('customer', customer)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{customer}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Geography Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Geography</label>
                      <div className="space-y-2">
                        {uniqueGeographies.map((geo) => (
                          <label key={geo} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.geography.includes(geo)}
                              onChange={() => toggleFilter('geography', geo)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{geo}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Collector Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Collector</label>
                      <div className="space-y-2">
                        {uniqueCollectors.map((collector) => (
                          <label key={collector} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.collector.includes(collector)}
                              onChange={() => toggleFilter('collector', collector)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{collector}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Currency Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Currency</label>
                      <div className="space-y-2">
                        {uniqueCurrencies.map((currency) => (
                          <label key={currency} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.currency.includes(currency)}
                              onChange={() => toggleFilter('currency', currency)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{currency}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Aging Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Aging</label>
                      <div className="space-y-2">
                        {uniqueAgingBuckets.map((aging) => (
                          <label key={aging} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.aging.includes(aging)}
                              onChange={() => toggleFilter('aging', aging)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{aging}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    {/* Status Filter */}
                    <div>
                      <label className="text-xs text-slate-600 mb-2 block">Status</label>
                      <div className="space-y-2">
                        {uniqueStatuses.map((status) => (
                          <label key={status} className="flex items-center gap-2 text-sm cursor-pointer">
                            <input
                              type="checkbox"
                              checked={filters.status.includes(status)}
                              onChange={() => toggleFilter('status', status)}
                              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                            />
                            <span className="text-slate-700">{status}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50">
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('id')}>
                      Invoice #
                      {sortField === 'id' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('customer')}>
                      Customer
                      {sortField === 'customer' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('geography')}>
                      Geography
                      {sortField === 'geography' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('collector')}>
                      Collector
                      {sortField === 'collector' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-right py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('amount')}>
                      Amount
                      {sortField === 'amount' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('currency')}>
                      Currency
                      {sortField === 'currency' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('dueDate')}>
                      Due Date
                      {sortField === 'dueDate' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('aging')}>
                      Aging
                      {sortField === 'aging' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                    <th className="text-left py-3 px-4 text-slate-600 cursor-pointer" onClick={() => sortInvoices('status')}>
                      Status
                      {sortField === 'status' && (
                        sortDirection === 'asc' ? <ChevronUp className="w-4 h-4 inline-block" /> : <ChevronDown className="w-4 h-4 inline-block" />
                      )}
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {sortedInvoices.map((invoice) => (
                    <tr key={invoice.id} className="border-b border-slate-100 hover:bg-slate-50">
                      <td className="py-3 px-4 text-blue-600">{invoice.id}</td>
                      <td className="py-3 px-4 text-slate-900">{invoice.customer}</td>
                      <td className="py-3 px-4 text-slate-600">{invoice.geography}</td>
                      <td className="py-3 px-4 text-slate-600">{invoice.collector}</td>
                      <td className="py-3 px-4 text-right text-slate-900">${invoice.amount.toLocaleString()}</td>
                      <td className="py-3 px-4 text-slate-600">{invoice.currency}</td>
                      <td className="py-3 px-4 text-slate-600">{invoice.dueDate}</td>
                      <td className="py-3 px-4 text-slate-600">{invoice.aging}</td>
                      <td className="py-3 px-4">
                        <span className={`px-2 py-1 rounded text-xs ${
                          invoice.status === 'Current' 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {invoice.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}