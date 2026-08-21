import { LegalDocument } from "../../components/LegalDocument";
export default function TradeTermsPage() {
  return (
    <LegalDocument
      eyebrow="Trade accounts"
      title="Trade Terms"
      intro="Approved workshop accounts are subject to these commercial principles and the account terms shown after approval."
    >
      <h2>Orders and pricing</h2>
      <p>
        Trade prices are shown ex GST. An order is accepted when DriveMate
        issues an Order Confirmation and reserves stock.
      </p>
      <h2>Account control</h2>
      <p>
        Approved purchasing terms and payment due dates apply together. New
        orders may be paused when an account is overdue or a new order would
        exceed the approved account terms.
      </p>
      <h2>Fitment responsibility</h2>
      <p>
        DriveMate records the VIN, vehicle details and lookup result used for a
        recommendation. Quality issues are handled through the return process.
        Costs caused by incorrect vehicle information supplied by the workshop
        may remain with the workshop.
      </p>
    </LegalDocument>
  );
}
