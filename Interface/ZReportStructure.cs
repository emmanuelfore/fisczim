using System;
using System.Collections.Generic;
using System.Linq;
using System.Text;
using System.Threading.Tasks;

namespace Revmax_Interface_Promun
{
    public class ZReportStructure
    {

        public string Code { get; set; }
        public string Message { get; set; }
        public string QRcode { get; set; }
        public string VerificationCode { get; set; }
        public string FiscalDay { get; set; }

        public Data2 Data { get; set; }

        

        

        



        //public List<VatTotal> VatTotals { get; set; }



    }

    public class Data2
    {
        public List<ZReport> ZReports { get; set; }

    }

}
