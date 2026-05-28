// Shared invoice data used across all components for consistency

export interface Invoice {
  id: string;
  customer: string;
  amount: number;
  dueDate: string;
  paidDate?: string;
  aging: string;
  status: string;
  geography: string;
  collector: string;
  currency: string;
  daysToPay?: number;
  daysOverdue?: number;
  risk?: string;
  lastContact?: string;
}

// All invoices in the system - this is the single source of truth
export const allInvoices: Invoice[] = [
  // 90+ days overdue - 15 invoices
  { id: 'INV-10101', customer: 'Mega Corp Industries', amount: 4200, dueDate: '2024-08-15', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 102, risk: 'high', lastContact: '2024-10-15' },
  { id: 'INV-10102', customer: 'Quality Partners LLC', amount: 2800, dueDate: '2024-09-20', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 66, risk: 'high', lastContact: '2024-11-01' },
  { id: 'INV-10103', customer: 'Legacy Systems Inc', amount: 1900, dueDate: '2024-09-05', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 81, risk: 'high', lastContact: '2024-10-20' },
  { id: 'INV-10104', customer: 'Vintage Industries', amount: 3100, dueDate: '2024-08-28', aging: '90+ days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'USD', daysOverdue: 89, risk: 'high', lastContact: '2024-10-25' },
  { id: 'INV-10105', customer: 'Classic Trading Co', amount: 2500, dueDate: '2024-09-12', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysOverdue: 74, risk: 'high', lastContact: '2024-11-05' },
  { id: 'INV-10106', customer: 'Heritage Products', amount: 1800, dueDate: '2024-09-18', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 68, risk: 'medium', lastContact: '2024-11-10' },
  { id: 'INV-10107', customer: 'Traditional Supplies', amount: 2200, dueDate: '2024-08-22', aging: '90+ days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 95, risk: 'high', lastContact: '2024-10-18' },
  { id: 'INV-10108', customer: 'Timeless Solutions', amount: 1600, dueDate: '2024-09-08', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 78, risk: 'medium', lastContact: '2024-11-08' },
  { id: 'INV-10109', customer: 'Established Corp', amount: 2900, dueDate: '2024-09-15', aging: '90+ days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 71, risk: 'medium', lastContact: '2024-11-12' },
  { id: 'INV-10110', customer: 'Pioneer Trading', amount: 1500, dueDate: '2024-08-30', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 87, risk: 'high', lastContact: '2024-10-22' },
  { id: 'INV-10111', customer: 'Foundation Industries', amount: 1700, dueDate: '2024-09-10', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 76, risk: 'medium', lastContact: '2024-11-15' },
  { id: 'INV-10112', customer: 'Original Partners', amount: 1400, dueDate: '2024-09-22', aging: '90+ days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 64, risk: 'medium', lastContact: '2024-11-18' },
  { id: 'INV-10113', customer: 'Historic Distributors', amount: 1200, dueDate: '2024-08-25', aging: '90+ days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 92, risk: 'high', lastContact: '2024-10-28' },
  { id: 'INV-10114', customer: 'Senior Solutions', amount: 1100, dueDate: '2024-09-17', aging: '90+ days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 69, risk: 'medium', lastContact: '2024-11-20' },
  { id: 'INV-10115', customer: 'Veteran Supplies', amount: 1000, dueDate: '2024-09-03', aging: '90+ days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 83, risk: 'medium', lastContact: '2024-11-22' },
  
  // 61-90 days overdue - 20 invoices
  { id: 'INV-10201', customer: 'Tech Solutions Inc', amount: 5200, dueDate: '2024-10-20', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 36, risk: 'medium', lastContact: '2024-11-15' },
  { id: 'INV-10202', customer: 'ABC Manufacturing Ltd', amount: 4800, dueDate: '2024-10-15', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysOverdue: 41, risk: 'medium', lastContact: '2024-11-10' },
  { id: 'INV-10203', customer: 'Precision Tools Inc', amount: 3900, dueDate: '2024-10-18', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 38, risk: 'medium', lastContact: '2024-11-18' },
  { id: 'INV-10204', customer: 'Industrial Components', amount: 3400, dueDate: '2024-10-22', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 34, risk: 'low', lastContact: '2024-11-20' },
  { id: 'INV-10205', customer: 'Machine Works Ltd', amount: 2900, dueDate: '2024-10-12', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 44, risk: 'medium', lastContact: '2024-11-08' },
  { id: 'INV-10206', customer: 'Equipment Rentals', amount: 3700, dueDate: '2024-10-25', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 31, risk: 'low', lastContact: '2024-11-22' },
  { id: 'INV-10207', customer: 'Assembly Systems', amount: 3200, dueDate: '2024-10-17', aging: '61-90 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 39, risk: 'medium', lastContact: '2024-11-14' },
  { id: 'INV-10208', customer: 'Automation Corp', amount: 2800, dueDate: '2024-10-14', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 42, risk: 'medium', lastContact: '2024-11-12' },
  { id: 'INV-10209', customer: 'Process Solutions', amount: 4100, dueDate: '2024-10-21', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 35, risk: 'medium', lastContact: '2024-11-19' },
  { id: 'INV-10210', customer: 'Mechanical Services', amount: 2600, dueDate: '2024-10-19', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 37, risk: 'low', lastContact: '2024-11-17' },
  { id: 'INV-10211', customer: 'Fabrication Inc', amount: 3500, dueDate: '2024-10-16', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 40, risk: 'medium', lastContact: '2024-11-13' },
  { id: 'INV-10212', customer: 'Engineering Group', amount: 2700, dueDate: '2024-10-23', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 33, risk: 'low', lastContact: '2024-11-21' },
  { id: 'INV-10213', customer: 'Technical Resources', amount: 4300, dueDate: '2024-10-13', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 43, risk: 'medium', lastContact: '2024-11-11' },
  { id: 'INV-10214', customer: 'Production Systems', amount: 3100, dueDate: '2024-10-24', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 32, risk: 'low', lastContact: '2024-11-23' },
  { id: 'INV-10215', customer: 'Manufacturing Hub', amount: 2500, dueDate: '2024-10-11', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysOverdue: 45, risk: 'medium', lastContact: '2024-11-09' },
  { id: 'INV-10216', customer: 'Industrial Supply', amount: 3600, dueDate: '2024-10-26', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 30, risk: 'low', lastContact: '2024-11-24' },
  { id: 'INV-10217', customer: 'Operations Center', amount: 2400, dueDate: '2024-10-27', aging: '61-90 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 29, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10218', customer: 'Maintenance Pro', amount: 2200, dueDate: '2024-10-10', aging: '61-90 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 46, risk: 'medium', lastContact: '2024-11-07' },
  { id: 'INV-10219', customer: 'Quality Control Inc', amount: 2000, dueDate: '2024-10-28', aging: '61-90 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 28, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10220', customer: 'Workshop Solutions', amount: 1800, dueDate: '2024-10-09', aging: '61-90 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 47, risk: 'medium', lastContact: '2024-11-06' },
  
  // 31-60 days overdue - 25 invoices
  { id: 'INV-10301', customer: 'Global Retail Corp', amount: 8900, dueDate: '2024-11-05', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 21, risk: 'low', lastContact: '2024-11-20' },
  { id: 'INV-10302', customer: 'ABC Manufacturing Ltd', amount: 7200, dueDate: '2024-11-01', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysOverdue: 25, risk: 'low', lastContact: '2024-11-18' },
  { id: 'INV-10303', customer: 'Metro Supplies Ltd', amount: 6800, dueDate: '2024-10-28', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 28, risk: 'low', lastContact: '2024-11-15' },
  { id: 'INV-10304', customer: 'Coastal Distributors', amount: 7500, dueDate: '2024-10-30', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 26, risk: 'low', lastContact: '2024-11-17' },
  { id: 'INV-10305', customer: 'Valley Electronics', amount: 6400, dueDate: '2024-11-02', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 24, risk: 'low', lastContact: '2024-11-19' },
  { id: 'INV-10306', customer: 'Urban Systems', amount: 5900, dueDate: '2024-11-04', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 22, risk: 'low', lastContact: '2024-11-21' },
  { id: 'INV-10307', customer: 'Regional Partners', amount: 7100, dueDate: '2024-10-29', aging: '31-60 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 27, risk: 'low', lastContact: '2024-11-16' },
  { id: 'INV-10308', customer: 'District Trading', amount: 6700, dueDate: '2024-11-03', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 23, risk: 'low', lastContact: '2024-11-20' },
  { id: 'INV-10309', customer: 'Provincial Corp', amount: 5800, dueDate: '2024-10-31', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 25, risk: 'low', lastContact: '2024-11-18' },
  { id: 'INV-10310', customer: 'Territory Sales', amount: 6200, dueDate: '2024-11-06', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 20, risk: 'low', lastContact: '2024-11-22' },
  { id: 'INV-10311', customer: 'Local Ventures', amount: 7300, dueDate: '2024-10-27', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 29, risk: 'low', lastContact: '2024-11-14' },
  { id: 'INV-10312', customer: 'Community Services', amount: 5600, dueDate: '2024-11-07', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP', daysOverdue: 19, risk: 'low', lastContact: '2024-11-23' },
  { id: 'INV-10313', customer: 'Municipal Supply', amount: 6900, dueDate: '2024-11-08', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 18, risk: 'low', lastContact: '2024-11-24' },
  { id: 'INV-10314', customer: 'County Resources', amount: 6500, dueDate: '2024-10-26', aging: '31-60 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 30, risk: 'low', lastContact: '2024-11-13' },
  { id: 'INV-10315', customer: 'Township Industries', amount: 5400, dueDate: '2024-11-09', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 17, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10316', customer: 'Village Trading', amount: 7600, dueDate: '2024-10-25', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 31, risk: 'low', lastContact: '2024-11-12' },
  { id: 'INV-10317', customer: 'Suburb Solutions', amount: 6100, dueDate: '2024-11-10', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 16, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10318', customer: 'Downtown Corp', amount: 5700, dueDate: '2024-10-24', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 32, risk: 'low', lastContact: '2024-11-11' },
  { id: 'INV-10319', customer: 'Uptown Partners', amount: 6600, dueDate: '2024-11-11', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 15, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10320', customer: 'Midtown Services', amount: 7400, dueDate: '2024-10-23', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 33, risk: 'low', lastContact: '2024-11-10' },
  { id: 'INV-10321', customer: 'Eastside Trading', amount: 5500, dueDate: '2024-11-12', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 14, risk: 'low', lastContact: '2024-11-24' },
  { id: 'INV-10322', customer: 'Westside Industries', amount: 6300, dueDate: '2024-10-22', aging: '31-60 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 34, risk: 'low', lastContact: '2024-11-09' },
  { id: 'INV-10323', customer: 'Northside Corp', amount: 7000, dueDate: '2024-11-13', aging: '31-60 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysOverdue: 13, risk: 'low', lastContact: '2024-11-23' },
  { id: 'INV-10324', customer: 'Southside Partners', amount: 5300, dueDate: '2024-10-21', aging: '31-60 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 35, risk: 'low', lastContact: '2024-11-08' },
  { id: 'INV-10325', customer: 'Central Business', amount: 6000, dueDate: '2024-11-14', aging: '31-60 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 12, risk: 'low', lastContact: '2024-11-22' },
  
  // 1-30 days overdue - 30 invoices
  { id: 'INV-10401', customer: 'Premium Distributors', amount: 18500, dueDate: '2024-11-15', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 11, risk: 'low', lastContact: '2024-11-23' },
  { id: 'INV-10402', customer: 'Summit Corporation', amount: 16200, dueDate: '2024-11-10', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 16, risk: 'low', lastContact: '2024-11-21' },
  { id: 'INV-10403', customer: 'Global Tech Solutions', amount: 15800, dueDate: '2024-11-12', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 14, risk: 'low', lastContact: '2024-11-22' },
  { id: 'INV-10404', customer: 'Riverside Partners', amount: 14900, dueDate: '2024-11-08', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 18, risk: 'low', lastContact: '2024-11-20' },
  { id: 'INV-10405', customer: 'Northwest Trading', amount: 13400, dueDate: '2024-11-14', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 12, risk: 'low', lastContact: '2024-11-24' },
  { id: 'INV-10406', customer: 'Pacific Ventures', amount: 17600, dueDate: '2024-11-11', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 15, risk: 'low', lastContact: '2024-11-23' },
  { id: 'INV-10407', customer: 'Mountain Corp', amount: 12700, dueDate: '2024-11-09', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 17, risk: 'low', lastContact: '2024-11-21' },
  { id: 'INV-10408', customer: 'Ocean Industries', amount: 15300, dueDate: '2024-11-13', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 13, risk: 'low', lastContact: '2024-11-24' },
  { id: 'INV-10409', customer: 'Forest Solutions', amount: 11900, dueDate: '2024-11-16', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 10, risk: 'low', lastContact: '2024-11-24' },
  { id: 'INV-10410', customer: 'Desert Trading', amount: 14200, dueDate: '2024-11-07', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 19, risk: 'low', lastContact: '2024-11-20' },
  { id: 'INV-10411', customer: 'Prairie Partners', amount: 13800, dueDate: '2024-11-17', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP', daysOverdue: 9, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10412', customer: 'Lake Systems', amount: 16500, dueDate: '2024-11-06', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 20, risk: 'low', lastContact: '2024-11-19' },
  { id: 'INV-10413', customer: 'River Corp', amount: 12300, dueDate: '2024-11-18', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 8, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10414', customer: 'Canyon Industries', amount: 15700, dueDate: '2024-11-05', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 21, risk: 'low', lastContact: '2024-11-18' },
  { id: 'INV-10415', customer: 'Valley Ventures', amount: 11500, dueDate: '2024-11-19', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 7, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10416', customer: 'Highland Trading', amount: 14600, dueDate: '2024-11-04', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 22, risk: 'low', lastContact: '2024-11-17' },
  { id: 'INV-10417', customer: 'Lowland Partners', amount: 13100, dueDate: '2024-11-20', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 6, risk: 'low', lastContact: '2024-11-25' },
  { id: 'INV-10418', customer: 'Plateau Solutions', amount: 16800, dueDate: '2024-11-03', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 23, risk: 'low', lastContact: '2024-11-16' },
  { id: 'INV-10419', customer: 'Ridge Industries', amount: 12900, dueDate: '2024-11-21', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 5, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10420', customer: 'Peak Distributors', amount: 15900, dueDate: '2024-11-02', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 24, risk: 'low', lastContact: '2024-11-15' },
  { id: 'INV-10421', customer: 'Cliff Trading', amount: 11700, dueDate: '2024-11-22', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 4, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10422', customer: 'Bluff Partners', amount: 14400, dueDate: '2024-11-01', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysOverdue: 25, risk: 'low', lastContact: '2024-11-14' },
  { id: 'INV-10423', customer: 'Crest Industries', amount: 13600, dueDate: '2024-11-23', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 3, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10424', customer: 'Summit Ventures', amount: 16100, dueDate: '2024-10-31', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysOverdue: 26, risk: 'low', lastContact: '2024-11-13' },
  { id: 'INV-10425', customer: 'Apex Corp', amount: 12500, dueDate: '2024-11-24', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysOverdue: 2, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10426', customer: 'Pinnacle Trading', amount: 15100, dueDate: '2024-10-30', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysOverdue: 27, risk: 'low', lastContact: '2024-11-12' },
  { id: 'INV-10427', customer: 'Zenith Solutions', amount: 11300, dueDate: '2024-11-25', aging: '1-30 days', status: 'Overdue', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysOverdue: 1, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10428', customer: 'Acme Industries', amount: 14800, dueDate: '2024-10-29', aging: '1-30 days', status: 'Overdue', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysOverdue: 28, risk: 'low', lastContact: '2024-11-11' },
  { id: 'INV-10429', customer: 'Elite Partners', amount: 13200, dueDate: '2024-11-26', aging: '1-30 days', status: 'Overdue', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysOverdue: 0, risk: 'low', lastContact: '2024-11-26' },
  { id: 'INV-10430', customer: 'Prime Corp', amount: 16400, dueDate: '2024-10-28', aging: '1-30 days', status: 'Overdue', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysOverdue: 29, risk: 'low', lastContact: '2024-11-10' },
  
  // Current - Paid on time (these form the basis for calculating good payment behavior)
  // Global Tech Solutions - Good payer
  { id: 'INV-10501', customer: 'Global Tech Solutions', amount: 45000, dueDate: '2024-11-20', paidDate: '2024-11-18', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 28 },
  { id: 'INV-10502', customer: 'Global Tech Solutions', amount: 38000, dueDate: '2024-10-15', paidDate: '2024-10-14', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 29 },
  { id: 'INV-10503', customer: 'Global Tech Solutions', amount: 42000, dueDate: '2024-09-10', paidDate: '2024-09-08', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 27 },
  { id: 'INV-10504', customer: 'Global Tech Solutions', amount: 39000, dueDate: '2024-08-20', paidDate: '2024-08-19', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10505', customer: 'Global Tech Solutions', amount: 41000, dueDate: '2024-07-25', paidDate: '2024-07-24', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 29 },
  
  // Premium Distributors - Good payer
  { id: 'INV-10506', customer: 'Premium Distributors', amount: 52000, dueDate: '2024-11-22', paidDate: '2024-11-20', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 28 },
  { id: 'INV-10507', customer: 'Premium Distributors', amount: 48000, dueDate: '2024-10-18', paidDate: '2024-10-16', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 29 },
  { id: 'INV-10508', customer: 'Premium Distributors', amount: 55000, dueDate: '2024-09-15', paidDate: '2024-09-14', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10509', customer: 'Premium Distributors', amount: 49000, dueDate: '2024-08-12', paidDate: '2024-08-10', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 29 },
  
  // Metro Supplies Ltd - OK payer
  { id: 'INV-10510', customer: 'Metro Supplies Ltd', amount: 32000, dueDate: '2024-11-18', paidDate: '2024-11-22', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysToPay: 34 },
  { id: 'INV-10511', customer: 'Metro Supplies Ltd', amount: 28000, dueDate: '2024-10-12', paidDate: '2024-10-18', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysToPay: 36 },
  { id: 'INV-10512', customer: 'Metro Supplies Ltd', amount: 35000, dueDate: '2024-09-08', paidDate: '2024-09-10', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysToPay: 32 },
  { id: 'INV-10513', customer: 'Metro Supplies Ltd', amount: 30000, dueDate: '2024-08-05', paidDate: '2024-08-11', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysToPay: 36 },
  
  // Summit Corporation - Good payer
  { id: 'INV-10514', customer: 'Summit Corporation', amount: 41000, dueDate: '2024-11-16', paidDate: '2024-11-15', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 29 },
  { id: 'INV-10515', customer: 'Summit Corporation', amount: 38000, dueDate: '2024-10-10', paidDate: '2024-10-09', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 29 },
  { id: 'INV-10516', customer: 'Summit Corporation', amount: 44000, dueDate: '2024-09-06', paidDate: '2024-09-05', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 30 },
  
  // Coastal Distributors - OK payer
  { id: 'INV-10517', customer: 'Coastal Distributors', amount: 25000, dueDate: '2024-11-14', paidDate: '2024-11-20', aging: 'Current', status: 'Paid', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysToPay: 36 },
  { id: 'INV-10518', customer: 'Coastal Distributors', amount: 22000, dueDate: '2024-10-08', paidDate: '2024-10-15', aging: 'Current', status: 'Paid', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysToPay: 37 },
  { id: 'INV-10519', customer: 'Coastal Distributors', amount: 27000, dueDate: '2024-09-04', paidDate: '2024-09-10', aging: 'Current', status: 'Paid', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysToPay: 36 },
  
  // Regional Partners - OK payer (transitioning to bad)
  { id: 'INV-10520', customer: 'Regional Partners', amount: 29000, dueDate: '2024-11-12', paidDate: '2024-11-28', aging: 'Current', status: 'Paid', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysToPay: 46 },
  { id: 'INV-10521', customer: 'Regional Partners', amount: 31000, dueDate: '2024-10-06', paidDate: '2024-10-22', aging: 'Current', status: 'Paid', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysToPay: 46 },
  { id: 'INV-10522', customer: 'Regional Partners', amount: 28000, dueDate: '2024-09-02', paidDate: '2024-09-18', aging: 'Current', status: 'Paid', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysToPay: 46 },
  
  // Tech Solutions Inc - Bad payer
  { id: 'INV-10523', customer: 'Tech Solutions Inc', amount: 35000, dueDate: '2024-11-10', paidDate: '2024-12-01', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 51 },
  { id: 'INV-10524', customer: 'Tech Solutions Inc', amount: 32000, dueDate: '2024-10-04', paidDate: '2024-10-26', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 52 },
  { id: 'INV-10525', customer: 'Tech Solutions Inc', amount: 38000, dueDate: '2024-08-30', paidDate: '2024-09-22', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 53 },
  
  // Quality Partners LLC - Bad payer
  { id: 'INV-10526', customer: 'Quality Partners LLC', amount: 18000, dueDate: '2024-11-08', paidDate: '2024-12-05', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 57 },
  { id: 'INV-10527', customer: 'Quality Partners LLC', amount: 16000, dueDate: '2024-10-02', paidDate: '2024-10-30', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 58 },
  { id: 'INV-10528', customer: 'Quality Partners LLC', amount: 19000, dueDate: '2024-08-28', paidDate: '2024-09-26', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 59 },
  
  // ABC Manufacturing Ltd - Bad payer
  { id: 'INV-10529', customer: 'ABC Manufacturing Ltd', amount: 28000, dueDate: '2024-11-06', paidDate: '2024-12-10', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysToPay: 64 },
  { id: 'INV-10530', customer: 'ABC Manufacturing Ltd', amount: 26000, dueDate: '2024-09-30', paidDate: '2024-11-05', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysToPay: 66 },
  { id: 'INV-10531', customer: 'ABC Manufacturing Ltd', amount: 30000, dueDate: '2024-08-26', paidDate: '2024-10-02', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Emily Taylor', currency: 'GBP', daysToPay: 67 },
  
  // Mega Corp Industries - Bad payer
  { id: 'INV-10532', customer: 'Mega Corp Industries', amount: 24000, dueDate: '2024-11-04', paidDate: '2024-12-15', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 71 },
  { id: 'INV-10533', customer: 'Mega Corp Industries', amount: 22000, dueDate: '2024-09-28', paidDate: '2024-11-10', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 73 },
  { id: 'INV-10534', customer: 'Mega Corp Industries', amount: 26000, dueDate: '2024-08-24', paidDate: '2024-10-07', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 74 },
  
  // Additional Paid Invoices - Various customers
  { id: 'INV-10601', customer: 'Enterprise Systems Ltd', amount: 48000, dueDate: '2024-11-17', paidDate: '2024-11-16', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 29 },
  { id: 'INV-10602', customer: 'Nationwide Services', amount: 52000, dueDate: '2024-10-22', paidDate: '2024-10-21', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysToPay: 29 },
  { id: 'INV-10603', customer: 'Continental Trading', amount: 45000, dueDate: '2024-09-18', paidDate: '2024-09-17', aging: 'Current', status: 'Paid', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysToPay: 29 },
  { id: 'INV-10604', customer: 'Alliance Partners', amount: 51000, dueDate: '2024-11-09', paidDate: '2024-11-08', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10605', customer: 'Integrated Solutions', amount: 46000, dueDate: '2024-10-16', paidDate: '2024-10-15', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'GBP', daysToPay: 29 },
  { id: 'INV-10606', customer: 'Strategic Corp', amount: 49000, dueDate: '2024-09-12', paidDate: '2024-09-11', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10607', customer: 'Universal Trading', amount: 44000, dueDate: '2024-08-28', paidDate: '2024-08-27', aging: 'Current', status: 'Paid', geography: 'Latin America', collector: 'Jessica Lee', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10608', customer: 'International Ventures', amount: 53000, dueDate: '2024-11-21', paidDate: '2024-11-20', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Emily Taylor', currency: 'EUR', daysToPay: 29 },
  { id: 'INV-10609', customer: 'Global Industries', amount: 47000, dueDate: '2024-10-14', paidDate: '2024-10-13', aging: 'Current', status: 'Paid', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'AUD', daysToPay: 29 },
  { id: 'INV-10610', customer: 'Worldwide Partners', amount: 50000, dueDate: '2024-09-20', paidDate: '2024-09-19', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Robert Wilson', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10611', customer: 'Multinational Corp', amount: 43000, dueDate: '2024-08-17', paidDate: '2024-08-16', aging: 'Current', status: 'Paid', geography: 'Europe', collector: 'Michael Chen', currency: 'EUR', daysToPay: 30 },
  { id: 'INV-10612', customer: 'Transcontinental Systems', amount: 48500, dueDate: '2024-11-13', paidDate: '2024-11-12', aging: 'Current', status: 'Paid', geography: 'North America', collector: 'Sarah Johnson', currency: 'USD', daysToPay: 30 },
  { id: 'INV-10613', customer: 'Intercontinental Trading', amount: 46500, dueDate: '2024-10-09', paidDate: '2024-10-08', aging: 'Current', status: 'Paid', geography: 'Asia Pacific', collector: 'David Martinez', currency: 'SGD', daysToPay: 29 },
];

// Helper function to calculate DSO based on actual invoice data
export function calculateDSO(invoices?: Invoice[]): number {
  const invoicesToUse = invoices || allInvoices;
  const paidInvoices = invoicesToUse.filter(inv => inv.daysToPay !== undefined);
  if (paidInvoices.length === 0) return 42;
  
  const totalDaysToPay = paidInvoices.reduce((sum, inv) => sum + (inv.daysToPay || 0), 0);
  const avgDaysToPay = totalDaysToPay / paidInvoices.length;
  
  return Math.round(avgDaysToPay);
}

// Total AR calculation
export function calculateTotalAR(): number {
  return allInvoices.reduce((sum, inv) => sum + inv.amount, 0);
}

// Past Due AR calculation
export function calculatePastDueAR(): number {
  return allInvoices
    .filter(inv => inv.status === 'Overdue')
    .reduce((sum, inv) => sum + inv.amount, 0);
}

// Current AR calculation
export function calculateCurrentAR(): number {
  return allInvoices
    .filter(inv => inv.status === 'Paid' && inv.aging === 'Current')
    .reduce((sum, inv) => sum + inv.amount, 0);
}