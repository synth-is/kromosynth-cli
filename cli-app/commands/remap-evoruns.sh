#!/bin/sh

ids=(
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50__2024-09.jsonc
  # manual "01JA6KS8H4FQMDFX5SD89TF5Q1_evoConf_singleMap_refSingleEmbeddings_x100_mfcc_pca_retrainIncr50__2024-09"
  "01JAD7CCY1WSERKDPWMDM3EMFT_evoConf_singleMap_refSingleEmbeddings_x100_mfcc_pca_retrainIncr50__2024-09"
  "01JAH9M5SR7W6KCTS40KSTV8TH_evoConf_singleMap_refSingleEmbeddings_x100_mfcc_pca_retrainIncr50__2024-09"
  "01JAN8TFNC2VCV6215MV4QE4E9_evoConf_singleMap_refSingleEmbeddings_x100_mfcc_pca_retrainIncr50__2024-09"
  # one to go
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09.jsonc
  "01JA6KRYPX52QN3WD3RQ6PGFFQ_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09"
  "01JACMTDZPCW8P37H50Q7EKQ0E_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09"
  "01JAN8K1VVPW426KZJRZN1AR0V_evoConf_singleMap_nsynthTopScore_mfcc_pca_retrainIncr50__2024-09"
  # two to go
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_noveltyArchv__2024-09.jsonc
  "01JA6KS8HX2MTC0EMMHMRS7QYK_evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_noveltyArchv__2024-09"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_noveltySel__2024-09.jsonc
  "01JAGB93R4M0W8PTYTQGMG0SGS_evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_noveltySel__2024-09"
  "01JANKKBH6EGGQQE8ZHE86VHKY_evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_noveltySel__2024-09"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_surpriseSel__2024-09.jsonc
  "01JAGBHX4P0NHPZJ02FZ89HAJ7_evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_surpriseSel__2024-09"
  "01JANKVF2JCT659TKQJ57VD9PZ_evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_surpriseSel__2024-09"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_surpriseSel_AE__2024-09.jsonc
  "01JAMMR9JNFXP1YCPJ4RCBQQ06_evoConf_singleMap_refSingleEmb_mfcc_pca_retrainIncr50_surpriseSel_AE__2024-09"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_umap_retrainIncr50__2024-09.jsonc
  "01JAGAGHYK88S8Q68KC1S450RX_evoConf_singleMap_refSingleEmb_mfcc_umap_retrainIncr50__2024-09"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_mfcc_umap_retrainIncr50_surpriseSel__2024-09.jsonc
  "01JAGAXJZQHCWG1G7VJZD2FNV3_evoConf_singleMap_refSingleEmb_mfcc_umap_retrainIncr50_surpriseSel__2024-09"
  "01JANMETTEP23J9Y1SK2Q0DJDY_evoConf_singleMap_refSingleEmb_mfcc_umap_retrainIncr50_surpriseSel__2024-09"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_spectralCentroidAndFlatness__2024-10.jsonc
  "01JA654MZET68M56S709F9XKF4_evoConf_singleMap_refSingleEmb_spectralCentroidAndFlatness__2024-10"
  "01JACQBA2T0GBTHDRZDJZHBWMZ_evoConf_singleMap_refSingleEmb_spectralCentroidAndFlatness__2024-10"
  "01JAF9KY12HKS8K9VY9NVEFD6T_evoConf_singleMap_refSingleEmb_spectralCentroidAndFlatness__2024-10"
  "01JANMMZ8RPRCBT98314R46173_evoConf_singleMap_refSingleEmb_spectralCentroidAndFlatness__2024-10"
  "01JASH2EJJ1M35V4ZKJ6GN73FP_evoConf_singleMap_refSingleEmb_spectralCentroidAndFlatness__2024-10"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_spectralSpreadAndFlux__2024-10.jsonc
  "01JA6KRDQ1JR9A8BKRXCBGBYYB_evoConf_singleMap_refSingleEmb_spectralSpreadAndFlux__2024-10"
  "01JACQBGXSKDVKTDGYZTP262RR_evoConf_singleMap_refSingleEmb_spectralSpreadAndFlux__2024-10"
  "01JANMSY09JTFXAAD1QVAB8GZE_evoConf_singleMap_refSingleEmb_spectralSpreadAndFlux__2024-10"
  "01JARR0GEX2FRNHWP75CVZ6X6S_evoConf_singleMap_refSingleEmb_spectralSpreadAndFlux__2024-10"
  # /fp/projects01/ec29/bthj/QD/unsupervised/runsconf/singleMapBDs/evoConf_singleMap_refSingleEmb_vggish_pca_retrainIncr50__2024-09.jsonc
  "01JAG5Z7K5CFD89X9RNBEJ1A7T_evoConf_singleMap_refSingleEmb_vggish_pca_retrainIncr50__2024-09"
  "01JANN3BJEPWPGRJD0R9CSJZE9_evoConf_singleMap_refSingleEmb_vggish_pca_retrainIncr50__2024-09"
  "01JARS6YVE0D21X3015Q0EZNN3_evoConf_singleMap_refSingleEmb_vggish_pca_retrainIncr50__2024-09"
)
endpoints=(
  "/manual?features=spectral_centroid,spectral_flatness"
  "/manual?features=spectral_spread,spectral_flux"
)
terrainNameToNames=(
  "spectralCentroidXflatness"
  "spectralSpreadXflux"
)

for id in "${ids[@]}"; do
  for i in "${!endpoints[@]}"; do
    endpoint=${endpoints[$i]}
    terrainNameTo=${terrainNameToNames[$i]}
    /fp/projects01/ec29/bthj/kromosynth-cli/cli-app/commands/remap-between-elite-containers_fox.sh /fp/projects01/ec29/bthj/evoruns/singleMapBDs "$id" customRef1 "$terrainNameTo" mfcc "$endpoint" "/raw"
  done
done
