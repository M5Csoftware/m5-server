import { NextResponse } from "next/server";
import Shipment from "@/app/model/portal/Shipment";
import Bagging from "@/app/model/bagging";
import Run from "@/app/model/RunEntry";
import dbConnect from "@/app/lib/db";

await dbConnect();

export async function GET(req) {
    try {
        await dbConnect();

        const { searchParams } = new URL(req.url);
        const runNo = searchParams.get("runNo");
        const format = searchParams.get("format") || "standard";

        if (!runNo) {
            return NextResponse.json(
                { success: false, message: "runNo is required" },
                { status: 400 }
            );
        }

        const bagging = await Bagging.findOne({ runNo }).lean();
        const runData = await Run.findOne({ runNo }).lean();
        const shipments = await Shipment.find({ runNo }).lean();

        if (!shipments.length) {
            return NextResponse.json(
                { success: false, message: "No shipments found for this run number" },
                { status: 404 }
            );
        }

        const firstShip = shipments[0];

        // RUN INFO (Bagging → Run → Shipment fallback)
        const runInfo = {
            runNo,
            sector: bagging?.sector || runData?.sector || firstShip?.sector || "",
            flight: bagging?.flight || runData?.flight || firstShip?.flight || "",
            flightDate:
                bagging?.date ||
                runData?.date ||
                firstShip?.runDate ||
                firstShip?.date ||
                "",
            alMawb:
                bagging?.alMawb ||
                bagging?.Mawb ||
                runData?.alMawb ||
                runData?.Mawb ||
                firstShip?.alMawb ||
                "",
            counterPart:
                bagging?.counterPart ||
                runData?.counterPart ||
                firstShip?.counterPart ||
                "",
            noOfBags: bagging?.noOfBags || runData?.noOfBags || 0,
            noOfAwb: bagging?.noOfAwb || runData?.noOfAwb || shipments.length,
            runWeight: bagging?.runWeight || runData?.runWeight || 0,
        };

        // Function: Find shipment for a Bag row
        const findShipmentForBag = (bag) => {
            return shipments.find(
                (ship) =>
                    ship.awbNo?.trim() === bag.awbNo?.trim() ||
                    ship.awbNo?.trim() === bag.childShipment?.trim() ||
                    (
                        bag.forwardingNo &&
                        ship.forwardingNo &&
                        bag.forwardingNo.trim() === ship.forwardingNo.trim()
                    )
            );
        };

        let rows = [];

        // =====================
        // 🔥 BAG-FIRST MAPPING
        // =====================

        if (!bagging?.rowData) {
            return NextResponse.json({
                success: true,
                runInfo,
                count: 0,
                data: [],
            });
        }

        switch (format) {

            // CSV LHR EXPORT
            case "csv-lhr":
                rows = bagging.rowData.map((bag) => {
                    const ship = findShipmentForBag(bag);
                    return {
                        manifest_number: runNo,
                        flight_number: runInfo.flight,
                        flight_date: runInfo.flightDate,
                        mawb_number: runInfo.alMawb,
                        hawb_number: ship?.awbNo || bag.childShipment || "",
                        mawb_origin: ship?.origin || "",
                        mawb_destination: ship?.destination || "LHR",
                        total_bags: 1,
                        total_weight: (bag.bagWeight || 0).toFixed(2),
                        manifest_value_type: "ACTUAL",

                        mawb_shipper_name: ship?.company || "",
                        mawb_shipper_street_address_line_1: ship?.shipperAddressLine1 || "",
                        mawb_shipper_street_address_line_2: ship?.shipperAddressLine2 || "",
                        mawb_shipper_city: ship?.shipperCity || "",
                        mawb_shipper_county_or_state: ship?.shipperState || "",
                        mawb_shipper_postal_code: ship?.shipperPincode || "",
                        mawb_shipper_country_code: ship?.shipperCountry || "IN",
                        mawb_shipper_tel: ship?.shipperPhoneNumber || "",
                        mawb_shipper_email: ship?.shipperEmail || "",

                        mawb_consignee_name: ship?.customer || "",
                        mawb_consignee_street_address_line_1: ship?.receiverAddressLine1 || "",
                        mawb_consignee_street_address_line_2: ship?.receiverAddressLine2 || "",
                        mawb_consignee_city: ship?.receiverCity || "",
                        mawb_consignee_county_or_state: ship?.receiverState || "",
                        mawb_consignee_postal_code: ship?.receiverPincode || "",
                        mawb_consignee_country_code: ship?.receiverCountry || "GB",
                        mawb_consignee_tel: ship?.receiverPhoneNumber || "",
                        mawb_consignee_email: ship?.receiverEmail || "",

                        consignment_number: ship?.awbNo || "",
                        shipper_name: ship?.shipperFullName || ship?.company || "",
                        shipper_street_address_line_1: ship?.shipperAddressLine1 || "",
                        shipper_street_address_line_2: ship?.shipperAddressLine2 || "",
                        shipper_city: ship?.shipperCity || "",
                        shipper_county_or_state: ship?.shipperState || "",
                        shipper_postal_code: ship?.shipperPincode || "",
                        shipper_country_code: ship?.shipperCountry || "IN",
                        shipper_tel: ship?.shipperPhoneNumber || "",
                        shipper_email: ship?.shipperEmail || "",

                        consignee_name: ship?.receiverFullName || ship?.customer || "",
                        consignee_street_address_line_1: ship?.receiverAddressLine1 || "",
                        consignee_street_address_line_2: ship?.receiverAddressLine2 || "",
                        consignee_city: ship?.receiverCity || "",
                        consignee_county_or_state: ship?.receiverState || "",
                        consignee_postal_code: ship?.receiverPincode || "",
                        consignee_country_code: ship?.receiverCountry || "GB",
                        consignee_tel: ship?.receiverPhoneNumber || "",
                        consignee_email: ship?.receiverEmail || "",

                        pieces: 1 || 0,
                        weight: (bag.bagWeight || 0).toFixed(2) || 0,
                        description: ship?.goodstype || "",
                        value: ship?.totalInvoiceValue || 0,
                        value_currency_code: ship?.currency || "GBP",
                        service_info: ship?.service || "",
                        bag_numbers: bag.bagNo,
                    };
                });
                break;

            // TS Manifest Export
            case "ts-manifest":
                rows = bagging.rowData.map((bag) => {
                    const ship = findShipmentForBag(bag);
                    return {
                        flight: runInfo.flight,
                        awb_number: ship?.awbNo || bag.childShipment || "",
                        shipdate: runInfo.flightDate,
                        consignor_company: ship?.company || "",
                        cnr_name: ship?.shipperFullName || "",
                        cnr_address1: ship?.shipperAddressLine1 || "",
                        cnr_address2: ship?.shipperAddressLine2 || "",
                        cnr_address3: "",
                        cnr_city: ship?.shipperCity || "",
                        cnr_state: ship?.shipperState || "",
                        cnr_zip: ship?.shipperPincode || "",
                        cnr_country: ship?.shipperCountry || "IN",
                        cnr_telephone: ship?.shipperPhoneNumber || "",
                        consignee_company: ship?.customer || "",
                        cne_name: ship?.receiverFullName || "",
                        cne_address1: ship?.receiverAddressLine1 || "",
                        cne_address2: ship?.receiverAddressLine2 || "",
                        cne_address3: "",
                        cne_city: ship?.receiverCity || "",
                        cne_state: ship?.receiverState || "",
                        cne_zip: ship?.receiverPincode || "",
                        cnr_country1: ship?.receiverCountry || "GB",
                        cne_telephone: ship?.receiverPhoneNumber || "",
                        duty_flag: ship?.payment === "PPD" ? "DDP" : "DDU",
                        weight: ship?.totalActualWt || 0,
                        pcs: ship?.pcs || 0,
                        bag_number: bag.bagNo,
                        payment_type: ship?.payment || "",
                        packaging: "PKG",
                        package_type: "CTN",
                        description: ship?.goodstype || "",
                        qty: ship?.pcs || 0,
                        value: ship?.totalInvoiceValue || 0,
                        currency: ship?.currency || "GBP",
                        fwd_service: ship?.service || "",
                        forwarding_no: ship?.forwardingNo || "",
                    };
                });
                break;

            // DPD CSV Export
            case "dpd-csv":
                rows = bagging.rowData.map((bag) => {
                    const ship = findShipmentForBag(bag);
                    return {
                        recordtype: "D",
                        product: "DPD",
                        clientid: "",
                        bookedby: "",
                        senderphone: ship?.shipperPhoneNumber || "",
                        sendermobile: "",
                        senderemail: ship?.shipperEmail || "",
                        optionalpod: "",
                        optionalpodemail: "",
                        hawb: ship?.awbNo || bag.childShipment || "",
                        bookingdate: runInfo.flightDate,
                        clientrefrence1: bag.bagNo,
                        clientrefrence2: "",
                        clientrefrence3: "",
                        clientrefrence4: "",
                        thirdpartyref: "",
                        fourthpartyref: "",
                        collectioncompany: ship?.company || "",
                        collectioncompanyaddline1: ship?.shipperAddressLine1 || "",
                        collectioncompanyaddline2: ship?.shipperAddressLine2 || "",
                        collectioncompanyaddline3: "",
                        collectioncompanyaddline4: "",
                        collectionpostcode: ship?.shipperPincode || "",
                        collectionplace: ship?.shipperCity || "",
                        collectioncountry: ship?.shipperCountry || "IN",
                        collectioncode: "",
                        collectionbranch: "",
                        collectioncontact: ship?.shipperFullName || "",
                        collectionemail: ship?.shipperEmail || "",
                        collectionphone: ship?.shipperPhoneNumber || "",
                        collectionmobile: "",
                        collectionfax: "",
                        sentby: "",
                        timereadyforcollection: "",
                        readyattime: "",
                        closedate: "",
                        closetime: "",
                        deliverycompany: ship?.customer || "",
                        deliveryaddline1: ship?.receiverAddressLine1 || "",
                        deliveryaddline2: ship?.receiverAddressLine2 || "",
                        deliveryaddline3: "",
                        deliveryaddline4: "",
                        deliverypostcode: ship?.receiverPincode || "",
                        deliveryplace: ship?.receiverCity || "",
                        deliverycountry: ship?.receiverCountry || "GB",
                        deliverycode: "",
                        deliverybranch: "",
                        deliverycontact: ship?.receiverFullName || "",
                        deliveryemail: ship?.receiverEmail || "",
                        deliveryphone: ship?.receiverPhoneNumber || "",
                        deliverymobile: "",
                        deliveryfax: "",
                        searchsentto: "",
                        recipientposition: "",
                        recipientemail: "",
                        recipientphone: "",
                        deliveredafter: "",
                        deliveredaftertime: "",
                        deliverybyday: "",
                        deliverybytime: "",
                        contentstype: "NON-DOCUMENT",
                        contents: ship?.goodstype || "",
                        consignmentvalue: ship?.totalInvoiceValue || 0,
                        consignmentcurrency: ship?.currency || "GBP",
                        insurancevalue: "",
                        insurancecurrency: "",
                        distance: "",
                        paymentbyduty: ship?.payment === "PPD" ? "S" : "R",
                        packageformat: "P",
                        specialinstruction: "",
                        notes: bag.bagNo,
                        totalnumberofitems: ship?.pcs || 0,
                        totalActualWt: bag.bagWeight || ship?.totalActualWt || 0,
                        service: ship?.service || "",
                        route: "",
                        proformacurrency: ship?.currency || "GBP",
                        reasonforexport: "SALE",
                        nameandaddressofmanufacturer: "",
                        countryoforigin: ship?.shipperCountry || "IN",
                        proformanote: "",
                        bookthirdparty: "",
                        displaycollectioninstruction: "",
                        deliveryinstruction: "",
                        shippertintype: "",
                        receivertintype: "",
                        shippertin: "",
                        receivertin: "",
                        dutypayoraccount: "",
                        dutypayorcountry: "",
                        dutypayorpostcode: "",
                        supplierdoctype: "",
                        hazardous: "N",
                        termofsale: ship?.payment === "PPD" ? "DDP" : "DDU",
                        supplierreasoncode: "",
                        predeliverynotification: "",
                        specialarrangement: "",
                        securelocation: "",
                        additionalservicedetails: "",
                        signaturerequired: "Y",
                        labeltype: "",
                        iscollectionaddressresidence: "N",
                        isdeliveryaddressresidence: "N",
                        displaycollectionnote: "",
                        displayvehicletype: "",
                        returntype: "",
                        returncollectioninstruction: "",
                        returndeliveryinstruction: "",
                        returnshippertintype: "",
                        returnreceivertintype: "",
                        returnshippertin: "",
                        returnreceivertin: "",
                        returndutypayoraccount: "",
                        returndutypayorcountry: "",
                        returndutypayorpostcode: "",
                        returnsupplierdoctype: "",
                        returnhazardous: "",
                        returntermofsale: "",
                        returnsupplierreasoncode: "",
                        returnpredeliverynotification: "",
                        returnspecialarrangement: "",
                        returnsecurelocation: "",
                        returnadditionalservicedetails: "",
                        returnsignaturerequired: "",
                        returnlabeltype: "",
                        collectionadditionalemail: "",
                        deliveryadditionalemail: "",
                        notifypartycompany: "",
                        notifypartyaddressline1: "",
                        notifypartyaddressline2: "",
                        notifypartyaddressline3: "",
                        notifypartyaddressline4: "",
                        notifypartypostcode: "",
                        notifypartyplace: "",
                        notifypartycountry: "",
                        notifypartycode: "",
                        notifypartybranch: "",
                        notifypartycontact: "",
                        notifypartyemail: "",
                        notifypartyphone: "",
                        notifypartymobile: "",
                        notifypartyfax: "",
                        isnotifypartyaddressresidence: "",
                        notifypartyadditionalemail: "",
                        collectionw3waddress: "",
                        deliveryw3waddress: "",
                        notifypartyw3waddress: "",
                        eventcode: "",
                        eventdate: "",
                        ud03: "",
                        serviceoption: "",
                        timeslot: "",
                        bookingconfirmationnumber: "",
                        shippersloadandcount: "",
                        returnroutecode: "",
                        recipientid: "",
                        deliverydepartment: "",
                        deliverydesk: "",
                        carriercompany: "",
                        alternativestaff: "",
                        alternativestaffcontactno: "",
                        alternativestaffemail: "",
                        deliverybuilding: "",
                        deliveryfloor: "",
                        sender: "",
                        deliverybyday1: "",
                        deliverybytime1: "",
                        assignedto: "",
                        deliverymethod: "",
                        eventcode1: "",
                        sendereori: "",
                        receivereori: "",
                        billingcompany: "",
                        billingaddressline1: "",
                        billingaddressline2: "",
                        billingaddressline3: "",
                        billingaddressline4: "",
                        billingpostcode: "",
                        billingplace: "",
                        billingcountry: "",
                        billingcode: "",
                        billingbranch: "",
                        billingcontact: "",
                        billingemail: "",
                        billingphone: "",
                        billingmobile: "",
                        billingfax: "",
                        isbillingaddressresidence: "",
                        billingadditionalemail: "",
                        billingw3waddress: "",
                        billingeori: "",
                    };
                });
                break;

            // Default Summary View
            default:
                rows = bagging.rowData.map((bag) => {
                    const ship = findShipmentForBag(bag);

                    return {
                        runNo,
                        flightDate: runInfo.flightDate,
                        alMawb: runInfo.alMawb,
                        obc: ship?.origin || "",
                        flight: runInfo.flight,
                        counterPart: runInfo.counterPart,
                        countBag: 1,
                        countAwb: 1,
                        bagWeight: (bag.bagWeight || 0).toFixed(2),
                        totalActualWt: bag.bagWeight || ship?.totalActualWt || 0,
                        chargableWt: ship?.chargeableWt || 0,
                        bagNumbers: bag.bagNo,
                    };
                });
                break;
        }

        return NextResponse.json({
            success: true,
            runInfo,
            count: rows.length,
            data: rows,
            baggingData: bagging?.rowData || [],
        });

    } catch (err) {
        console.error("UK Manifest Error:", err);
        return NextResponse.json(
            {
                success: false,
                message: "Server error fetching manifest",
                error: err.message,
            },
            { status: 500 }
        );
    }
}
