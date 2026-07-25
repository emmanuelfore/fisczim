using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class TaxTable
    {
        public string TaxPercent { get; set; }
        public decimal NetAmount { get; set; }
        public decimal TaxAmount { get; set; }
        public decimal SalesAmountWithTax { get; set; }
    }
}
